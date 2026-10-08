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
    "initial_cash": "higher",
    "units_per_customer_month": "higher",
    "take_rate": "higher",
    "unit_price": "higher",
    "unit_variable_cost": "lower",
    "capacity_units_month": "higher",
    "repeat_purchase_monthly": "higher",
}
BUSINESS_MODELS = {"subscription", "marketplace", "one_time", "hardware", "services"}


def model_metadata(business_model):
    if business_model not in BUSINESS_MODELS:
        raise ValueError("Unknown business model")
    return {
        "business_model": business_model,
        "annualized_revenue_label": "ARR"
        if business_model == "subscription"
        else "Annualized net platform revenue"
        if business_model == "marketplace"
        else "Annualized sales run rate",
        "customer_label": "Active subscribers"
        if business_model == "subscription"
        else "Cumulative buyers"
        if business_model in {"one_time", "hardware"}
        else "Active buyers",
        "method": "Subscription bills retained accounts; marketplace recognizes commission, excluding GMV; one-time and hardware recognize new and repeat sales; services is capped by fulfilment capacity. Annualized sales are a run rate, not recurring contracted revenue.",
    }


def annual_value(params, business_model):
    if business_model == "subscription":
        return params["arpu_month"] * 12
    if business_model == "marketplace":
        return (
            params.get("unit_price", params["arpu_month"])
            * params.get("units_per_customer_month", 1)
            * params.get("take_rate", 0.15)
            * 12
        )
    if business_model == "services":
        return params.get("unit_price", params["arpu_month"]) * params.get("units_per_customer_month", 1) * 12
    return params.get("unit_price", params["arpu_month"]) * (
        1 + 12 * params.get("repeat_purchase_monthly", 0)
    )


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


def market_model(assumptions, business_model="subscription"):
    result = {}
    for case in CASES:

        def get(key):
            return assumptions[key][case] if assumptions[key] else None

        tam = get("tam_top_down")
        params = {key: value[case] for key, value in assumptions.items() if value is not None}
        sam = get("target_accounts") * annual_value(params, business_model)
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
    result = {
        key: dict(assumptions[key])
        for key in BETTER_WHEN
        if key != "max_customers" and assumptions.get(key) is not None
    }
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


def revenue_model(params, months=60, business_model="subscription"):
    if not 1 <= months <= 120:
        raise ValueError("Projection horizon must be 1–120 months")
    metadata = model_metadata(business_model)
    initial_cash = params.get("initial_cash")
    customers, new, cumulative_net, min_cash = 0.0, params["new_customers_start"], 0.0, initial_cash or 0.0
    exhausted = 0 if initial_cash == 0 else None
    breakeven, rows = None, []
    for month in range(1, months + 1):
        retained = (
            customers
            if business_model in {"one_time", "hardware"}
            else customers * (1 - params["monthly_churn"])
        )
        added = min(new, max(params["max_customers"] - retained, 0))
        if business_model == "hardware":
            repeat_units = min(
                retained * params.get("repeat_purchase_monthly", 0), params.get("capacity_units_month", 1e12)
            )
            added = min(added, max(params.get("capacity_units_month", 1e12) - repeat_units, 0))
        customers = retained + added
        arpu = params["arpu_month"] * (1 + params["monthly_expansion"]) ** (month - 1)
        units, gmv = None, None
        if business_model == "subscription":
            revenue = customers * arpu
            gross_profit = revenue * params["gross_margin"]
        else:
            unit_price = params.get("unit_price", arpu) * (1 + params["monthly_expansion"]) ** (month - 1)
            requested = (
                (added + retained * params.get("repeat_purchase_monthly", 0))
                if business_model in {"one_time", "hardware"}
                else customers * params.get("units_per_customer_month", 1)
            )
            units = (
                min(requested, params.get("capacity_units_month", requested))
                if business_model in {"hardware", "services"}
                else requested
            )
            gmv = units * unit_price if business_model == "marketplace" else None
            revenue = gmv * params.get("take_rate", 0.15) if gmv is not None else units * unit_price
            gross_profit = revenue - units * params.get("unit_variable_cost", 0)
        net = gross_profit - added * params["cac"] - params["fixed_costs_month"]
        cumulative_net += net
        cash = initial_cash + cumulative_net if initial_cash is not None else None
        min_cash = min(min_cash, (initial_cash or 0) + cumulative_net)
        if cash is not None and cash <= 0 and exhausted is None:
            exhausted = month
        if breakeven is None and net >= 0:
            breakeven = month
        new *= 1 + params["new_growth_monthly"]
        rows.append(
            {
                "month": month,
                "customers": customers,
                "new_customers": added,
                "units": units,
                "gmv": gmv,
                "revenue": revenue,
                "gross_profit": gross_profit,
                "net": net,
                "cash": cash,
                "cumulative_net": cumulative_net,
            }
        )
    return {
        "rows": rows,
        "annual_revenue": [
            sum(row["revenue"] for row in rows[index : index + 12]) for index in range(0, months, 12)
        ],
        "arr_end": rows[-1]["revenue"] * 12,
        "customers_end": customers,
        "funding_need": -min_cash,
        "breakeven_month": breakeven,
        "initial_cash": initial_cash,
        "runway_months": exhausted,
        "runway_status": "unknown"
        if initial_cash is None
        else "exhausted"
        if exhausted is not None
        else "within_horizon",
        "metadata": metadata,
    }


def unit_economics(params, cap_months=60, business_model="subscription"):
    lifetime = min(1 / params["monthly_churn"], cap_months) if params["monthly_churn"] > 0 else cap_months
    gp = params["arpu_month"] * params["gross_margin"]
    arpu = params["arpu_month"]
    if business_model != "subscription":
        price, cost = params.get("unit_price", arpu), params.get("unit_variable_cost", 0)
        if business_model in {"one_time", "hardware"}:
            arpu, gp = price, price - cost
            lifetime = 1 + cap_months * params.get("repeat_purchase_monthly", 0)
        else:
            units = params.get("units_per_customer_month", 1)
            arpu = price * units * (params.get("take_rate", 0.15) if business_model == "marketplace" else 1)
            gp = arpu - cost * units
    ltv = gp * lifetime
    return {
        "arpu": arpu,
        "gross_margin": gp / arpu if arpu > 0 else None,
        "cac": params["cac"],
        "lifetime_months": lifetime,
        "ltv": ltv,
        "ltv_cac": ltv / params["cac"] if params["cac"] and gp >= 0 else None,
        "payback_months": params["cac"] / gp if gp > 0 else None,
        "lifetime_label": "Expected purchases over horizon"
        if business_model in {"one_time", "hardware"}
        else "Capped customer lifetime in months",
        "payback_label": "Purchases to recover CAC"
        if business_model in {"one_time", "hardware"}
        else "Months to recover CAC",
    }


def monte_carlo(ranges, months=60, runs=1000, seed=7, business_model="subscription"):
    rng = random.Random(seed)
    arr, need, trajectories, breaks = [], [], [[] for _ in range(months)], 0
    for _ in range(runs):
        params = {
            key: rng.triangular(value["low"], value["high"], value["base"]) for key, value in ranges.items()
        }
        result = revenue_model(params, months, business_model)
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


def sensitivity(ranges, months=60, business_model="subscription"):
    base = {key: value["base"] for key, value in ranges.items()}
    items = []
    for key, value in ranges.items():
        low = revenue_model({**base, key: value["low"]}, months, business_model)["arr_end"]
        high = revenue_model({**base, key: value["high"]}, months, business_model)["arr_end"]
        items.append({"assumption": key, "arr_at_low": low, "arr_at_high": high, "swing": abs(high - low)})
    return {
        "base_arr": revenue_model(base, months, business_model)["arr_end"],
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


def compute(assumptions, months=60, runs=1000, business_model="subscription"):
    metadata = model_metadata(business_model)
    market = market_model(assumptions, business_model)
    ranges = revenue_ranges(assumptions)
    scenarios = {
        case: revenue_model(scenario(ranges, case), months, business_model)
        for case in ("pessimistic", "base", "optimistic")
    }
    unit = {case: unit_economics(scenario(ranges, case), months, business_model) for case in scenarios}
    simulation = monte_carlo(ranges, months, runs, business_model=business_model)
    flags = []
    target = assumptions["target_accounts"]["base"]
    penetration = scenarios["base"]["customers_end"] / target if target else None
    if penetration is not None and penetration > 0.15:
        flags.append("Base case exceeds the heuristic threshold of 15% target-account penetration")
    if scenarios["base"]["arr_end"] > market["base"]["sam_bottom_up"]:
        flags.append(
            "End-of-horizon annualized revenue exceeds the current-price bottom-up serviceable market; check expansion assumptions"
        )
    if business_model in {"hardware", "services"}:
        flags.append(
            "Fulfilment is capped by monthly capacity; no inventory, backlogs or working-capital timing is assumed. Validate capacity and direct unit costs before planning spend."
        )
    if business_model == "marketplace":
        flags.append(
            "Marketplace revenue is commission only. Transaction volume and take rate are assumptions; GMV is not platform revenue."
        )
    if business_model in {"one_time", "hardware"}:
        flags.append(
            "Repeat purchases are assumed per prior buyer; LTV is horizon-bounded purchases and CAC payback is measured in purchases, not months."
        )
    return {
        "market": market,
        "scenarios": scenarios,
        "unit_economics": unit,
        "simulation": simulation,
        "sensitivity": sensitivity(ranges, months, business_model),
        "metadata": metadata,
        "flags": flags,
        "penetration": penetration,
    }
