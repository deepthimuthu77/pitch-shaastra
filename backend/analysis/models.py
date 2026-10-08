import math
import random
import re
from decimal import Decimal

CASES = ("low", "base", "high")
BETTER_WHEN = {
    "new_customers_start": "higher",
    "new_growth_monthly": "higher",
    "monthly_churn": "lower",
    "arpu_month": "higher",
    "monthly_expansion": "higher",
    "gross_margin": "higher",
    "cac": "lower",
    "fixed_costs_month": "lower",
    "max_customers": "higher",
}
WEDGE_WEIGHTS = {
    "pain_intensity": 0.25,
    "reachability": 0.20,
    "willingness_to_pay": 0.20,
    "competitive_gap": 0.15,
    "time_to_revenue": 0.10,
    "expansion_potential": 0.10,
}


def human(value, locale="intl"):
    if value is None:
        return "n/a"
    steps = (
        ((1e7, "Cr"), (1e5, "L"), (1e3, "K"))
        if locale == "IN"
        else ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K"))
    )
    for divisor, suffix in steps:
        if abs(value) >= divisor:
            return f"{value / divisor:.1f}{suffix}"
    return f"{value:,.0f}"


def market_model(assumptions):
    result = {}
    for case in CASES:

        def get(key):
            return assumptions[key][case] if assumptions[key] else None

        tam = get("tam_top_down")
        sam = get("target_accounts") * get("arpu_month") * 12
        result[case] = {
            "tam": tam,
            "sam_top_down": tam * get("sam_fraction") if tam is not None else None,
            "som_top_down": tam * get("sam_fraction") * get("som_fraction") if tam is not None else None,
            "sam_bottom_up": sam,
            "som_bottom_up": sam * get("adoption_share"),
        }
    base = result["base"]
    ratio = (
        base["sam_top_down"] / base["sam_bottom_up"]
        if base["sam_bottom_up"] and base["sam_top_down"] is not None
        else None
    )
    result["agreement"] = {
        "sam_ratio": ratio,
        "disagree": ratio is not None and (ratio > 3 or ratio < 1 / 3),
        "available": ratio is not None,
    }
    return result


def revenue_ranges(assumptions):
    result = {key: dict(assumptions[key]) for key in BETTER_WHEN if key != "max_customers"}
    result["max_customers"] = {
        case: assumptions["target_accounts"][case] * assumptions["max_penetration"][case] for case in CASES
    }
    return result


def scenario(ranges, case):
    if case not in {"pessimistic", "base", "optimistic"}:
        raise ValueError("Invalid scenario")
    return {
        key: value["base"]
        if case == "base"
        else value["high" if ((case == "optimistic") == (BETTER_WHEN[key] == "higher")) else "low"]
        for key, value in ranges.items()
    }


def revenue_model(params, months=60):
    if not 1 <= months <= 120:
        raise ValueError("Projection horizon must be 1–120 months")
    customers, new, cash, min_cash = 0.0, params["new_customers_start"], 0.0, 0.0
    breakeven, rows = None, []
    for month in range(1, months + 1):
        retained = customers * (1 - params["monthly_churn"])
        added = min(new, max(params["max_customers"] - retained, 0))
        customers = retained + added
        arpu = params["arpu_month"] * (1 + params["monthly_expansion"]) ** (month - 1)
        revenue = customers * arpu
        net = revenue * params["gross_margin"] - added * params["cac"] - params["fixed_costs_month"]
        cash += net
        min_cash = min(min_cash, cash)
        if breakeven is None and net >= 0:
            breakeven = month
        new *= 1 + params["new_growth_monthly"]
        rows.append({"month": month, "customers": customers, "revenue": revenue, "net": net, "cash": cash})
    return {
        "rows": rows,
        "annual_revenue": [
            sum(row["revenue"] for row in rows[index : index + 12]) for index in range(0, months, 12)
        ],
        "arr_end": rows[-1]["revenue"] * 12,
        "customers_end": customers,
        "funding_need": -min_cash,
        "breakeven_month": breakeven,
    }


def unit_economics(params, cap_months=60):
    lifetime = min(1 / params["monthly_churn"], cap_months) if params["monthly_churn"] > 0 else cap_months
    gp = params["arpu_month"] * params["gross_margin"]
    ltv = gp * lifetime
    return {
        "arpu": params["arpu_month"],
        "gross_margin": params["gross_margin"],
        "cac": params["cac"],
        "lifetime_months": lifetime,
        "ltv": ltv,
        "ltv_cac": ltv / params["cac"] if params["cac"] else None,
        "payback_months": params["cac"] / gp if gp > 0 else None,
    }


def monte_carlo(ranges, months=60, runs=1000, seed=7):
    rng = random.Random(seed)
    arr, need, trajectories, breaks = [], [], [[] for _ in range(months)], 0
    for _ in range(runs):
        params = {
            key: rng.triangular(value["low"], value["high"], value["base"]) for key, value in ranges.items()
        }
        result = revenue_model(params, months)
        arr.append(result["arr_end"])
        need.append(result["funding_need"])
        breaks += result["breakeven_month"] is not None
        for index, row in enumerate(result["rows"]):
            trajectories[index].append(row["revenue"])

    def quantiles(values):
        values.sort()
        return {
            name: values[int(fraction * (len(values) - 1))]
            for name, fraction in (("p10", 0.1), ("p50", 0.5), ("p90", 0.9))
        }

    return {
        "arr_end": quantiles(arr),
        "funding_need": quantiles(need),
        "bands": [{"month": index + 1, **quantiles(values)} for index, values in enumerate(trajectories)],
        "p_breakeven": breaks / runs,
        "runs": runs,
        "seed": seed,
        "method": "Independent triangular assumptions; percentiles describe this model, not calibrated business probabilities.",
    }


def sensitivity(ranges, months=60):
    base = {key: value["base"] for key, value in ranges.items()}
    items = []
    for key, value in ranges.items():
        low = revenue_model({**base, key: value["low"]}, months)["arr_end"]
        high = revenue_model({**base, key: value["high"]}, months)["arr_end"]
        items.append({"assumption": key, "arr_at_low": low, "arr_at_high": high, "swing": abs(high - low)})
    return {
        "base_arr": revenue_model(base, months)["arr_end"],
        "items": sorted(items, key=lambda item: -item["swing"]),
    }


def wedge_score(scores, weights=None):
    weights = weights or WEDGE_WEIGHTS
    if (
        set(weights) != set(WEDGE_WEIGHTS)
        or any(not math.isfinite(v) or v < 0 for v in weights.values())
        or sum(weights.values()) <= 0
    ):
        raise ValueError("Wedge weights must cover all dimensions and have a positive total")
    return round(100 * sum(weights[key] * scores[key] for key in weights) / (5 * sum(weights.values())), 1)


def numeric_verdict(value, low, high, better_when="higher"):
    if low <= value <= high:
        return "consistent"
    return "optimistic" if (value > high if better_when == "higher" else value < low) else "conservative"


NUMBER = re.compile(
    r"(?<![\w])(-?\d[\d,]*(?:\.\d+)?)\s*(%|[kmbt]\b|million\b|billion\b|lakh\b|crore\b)?", re.I
)
MULTIPLIERS = {
    "k": 1000,
    "m": 1_000_000,
    "b": 1_000_000_000,
    "t": 1_000_000_000_000,
    "million": 1_000_000,
    "billion": 1_000_000_000,
    "lakh": 100_000,
    "crore": 10_000_000,
    "%": 0.01,
}


def numeric_tokens(text):
    return {
        Decimal(number.replace(",", "")) * Decimal(str(MULTIPLIERS.get((suffix or "").lower(), 1)))
        for number, suffix in NUMBER.findall(text)
    }


def grounded(text, context):
    allowed = set()

    def visit(value):
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (float, int)):
            allowed.add(Decimal(str(value)))
            allowed.update(numeric_tokens(human(value)))
        elif isinstance(value, str):
            allowed.update(numeric_tokens(value))
        elif isinstance(value, dict):
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(context)
    return numeric_tokens(text) <= allowed


def compute(assumptions, months=60, runs=1000):
    market = market_model(assumptions)
    ranges = revenue_ranges(assumptions)
    scenarios = {
        case: revenue_model(scenario(ranges, case), months) for case in ("pessimistic", "base", "optimistic")
    }
    unit = {case: unit_economics(scenario(ranges, case), months) for case in scenarios}
    simulation = monte_carlo(ranges, months, runs)
    flags = []
    target = assumptions["target_accounts"]["base"]
    penetration = scenarios["base"]["customers_end"] / target if target else None
    if penetration is not None and penetration > 0.15:
        flags.append("Base case exceeds the heuristic threshold of 15% target-account penetration")
    if scenarios["base"]["arr_end"] > market["base"]["sam_bottom_up"]:
        flags.append(
            "End-of-horizon ARR exceeds the current-price bottom-up serviceable market; check expansion assumptions"
        )
    return {
        "market": market,
        "scenarios": scenarios,
        "unit_economics": unit,
        "simulation": simulation,
        "sensitivity": sensitivity(ranges, months),
        "flags": flags,
        "penetration": penetration,
    }
