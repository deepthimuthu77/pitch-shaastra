import pytest
from pydantic import ValidationError

from backend.analysis.defaults import default_assumptions
from backend.analysis.models import (
    compute,
    grounded,
    market_model,
    numeric_verdict,
    revenue_model,
    revenue_ranges,
    scenario,
    unit_economics,
    wedge_score,
)
from backend.analysis.schemas import Assumption, Range


def assumptions():
    return {item["key"]: item["value"] for item in default_assumptions({"currency": "USD"})}


def test_missing_market_stays_unavailable():
    market = market_model(assumptions())
    assert market["base"]["tam"] is None
    assert market["base"]["sam_top_down"] is None
    assert market["base"]["sam_bottom_up"] == 5000 * 50 * 12
    assert not market["agreement"]["available"]


def test_scenarios_obey_cost_and_churn_direction():
    ranges = revenue_ranges(assumptions())
    low, base, high = [
        revenue_model(scenario(ranges, case)) for case in ("pessimistic", "base", "optimistic")
    ]
    assert low["arr_end"] <= base["arr_end"] <= high["arr_end"]
    assert low["funding_need"] >= base["funding_need"] >= high["funding_need"]
    assert scenario(ranges, "pessimistic")["cac"] == ranges["cac"]["high"]
    assert scenario(ranges, "optimistic")["monthly_churn"] == ranges["monthly_churn"]["low"]


def test_zero_churn_zero_cac_zero_margin_are_finite():
    params = scenario(revenue_ranges(assumptions()), "base")
    params.update(monthly_churn=0, cac=0, gross_margin=0)
    unit = unit_economics(params)
    assert unit["lifetime_months"] == 60
    assert unit["ltv_cac"] is None
    assert unit["payback_months"] is None


def test_market_ceiling_binds_even_with_large_acquisition():
    params = scenario(revenue_ranges(assumptions()), "base")
    params.update(max_customers=10, new_customers_start=1000, monthly_churn=0)
    result = revenue_model(params)
    assert all(row["customers"] <= 10 for row in result["rows"])


def test_simulation_reproduces_percentile_fan():
    a, b = compute(assumptions(), 24, 100), compute(assumptions(), 24, 100)
    assert a == b
    assert len(a["simulation"]["bands"]) == 24
    assert all(band["p10"] <= band["p50"] <= band["p90"] for band in a["simulation"]["bands"])


def test_grounding_understands_units_not_number_substrings():
    assert grounded("Revenue is $1M and margin 50%", {"revenue": 1_000_000, "margin": 0.5})
    assert not grounded("Revenue is $9M", {"revenue": 1_000_000})
    assert not grounded("Revenue is $1B", {"revenue": 1_000_000})
    assert grounded("₹2 crore", {"revenue": 20_000_000})


def test_claim_direction_for_costs():
    assert numeric_verdict(5, 10, 20, "lower") == "optimistic"
    assert numeric_verdict(25, 10, 20, "lower") == "conservative"
    assert numeric_verdict(15, 10, 20, "lower") == "consistent"


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1])
def test_nonfinite_and_negative_assumptions_rejected(value):
    with pytest.raises(ValidationError):
        Range(low=0, base=value, high=1)


def test_fraction_and_order_constraints():
    with pytest.raises(ValidationError):
        Range(low=10, base=5, high=20)
    with pytest.raises(ValidationError):
        Assumption(
            key="monthly_churn",
            label="churn",
            unit="fraction",
            value={"low": 0.1, "base": 0.5, "high": 2},
            provenance="founder",
            rationale="input",
        )
    with pytest.raises(ValueError):
        wedge_score({"pain_intensity": 3}, {"pain_intensity": 0})
