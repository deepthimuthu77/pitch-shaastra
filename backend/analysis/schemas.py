from typing import Literal

from pydantic import Field, model_validator

from backend.llm.schemas import StrictModel

REQUIRED_KEYS = [
    "tam_top_down",
    "sam_fraction",
    "som_fraction",
    "target_accounts",
    "adoption_share",
    "max_penetration",
    "new_customers_start",
    "new_growth_monthly",
    "monthly_churn",
    "arpu_month",
    "monthly_expansion",
    "gross_margin",
    "cac",
    "fixed_costs_month",
]
FRACTIONS = {
    "sam_fraction",
    "som_fraction",
    "adoption_share",
    "max_penetration",
    "monthly_churn",
    "gross_margin",
}


class Range(StrictModel):
    low: float = Field(ge=0, le=1e12)
    base: float = Field(ge=0, le=1e12)
    high: float = Field(ge=0, le=1e12)

    @model_validator(mode="after")
    def ordered(self):
        if not self.low <= self.base <= self.high:
            raise ValueError("Need low <= base <= high")
        return self


class Assumption(StrictModel):
    key: str
    label: str = Field(max_length=120)
    unit: str = Field(max_length=40)
    value: Range | None
    provenance: Literal["sourced", "founder", "model_default", "estimated"]
    fact_ids: list[str] = Field(default_factory=list, max_length=5)
    rationale: str = Field(max_length=500)

    @model_validator(mode="after")
    def domain(self):
        if self.key not in REQUIRED_KEYS:
            raise ValueError("Unknown assumption")
        if self.key != "tam_top_down" and self.value is None:
            raise ValueError("Required computational assumption")
        if self.value:
            cap = (
                1
                if self.key in FRACTIONS
                else 0.5
                if self.key == "new_growth_monthly"
                else 0.2
                if self.key == "monthly_expansion"
                else 1e12
            )
            if self.value.high > cap:
                raise ValueError(f"{self.key} exceeds domain limit {cap}")
        return self


class AssumptionSet(StrictModel):
    analysis: str = Field(min_length=20, max_length=2000)
    assumptions: list[Assumption] = Field(min_length=14, max_length=14)

    @model_validator(mode="after")
    def complete(self):
        if {a.key for a in self.assumptions} != set(REQUIRED_KEYS):
            raise ValueError("Each required assumption must appear exactly once")
        return self


class Profile(StrictModel):
    problem: str = Field(max_length=700)
    solution: str = Field(max_length=700)
    segment: str = Field(max_length=200)
    business_model: str = Field(max_length=100)
    industry: str = Field(max_length=100)
    stage: Literal["idea", "prototype", "early_revenue", "growth"]


class IntakeResult(StrictModel):
    analysis: str = Field(min_length=20, max_length=1000)
    profile: Profile
    market_terms: list[str] = Field(min_length=1, max_length=5)


class Fact(StrictModel):
    topic: Literal["market", "competitors", "pricing", "funding", "regulation", "adoption"]
    metric: str = Field(max_length=100)
    value: float | None = Field(default=None, ge=0, le=1e15)
    unit: str = Field(max_length=40)
    year: int | None = Field(default=None, ge=1990, le=2100)
    geography: str | None = Field(default=None, max_length=100)
    note: str = Field(max_length=400)
    source_id: str = Field(max_length=30)
    confidence: Literal["high", "medium", "low"]
    evidence_quote: str = Field(min_length=1, max_length=400)


class FactsResult(StrictModel):
    analysis: str = Field(min_length=20, max_length=1000)
    facts: list[Fact] = Field(default_factory=list, max_length=30)


class Competitor(StrictModel):
    name: str = Field(max_length=100)
    type: Literal["direct", "indirect", "substitute", "adjacent", "incumbent"]
    what_they_do: str = Field(max_length=500)
    target_customer: str = Field(max_length=150)
    pricing: str | None = Field(default=None, max_length=200)
    scale_signals: str | None = Field(default=None, max_length=300)
    strengths: list[str] = Field(default_factory=list, max_length=5)
    weaknesses: list[str] = Field(default_factory=list, max_length=5)
    overlap: Literal["high", "medium", "low"]
    threat: Literal["high", "medium", "low"]
    map_x: int = Field(ge=0, le=100)
    map_y: int = Field(ge=0, le=100)
    source_ids: list[str] = Field(default_factory=list, max_length=6)


class CompetitorSet(StrictModel):
    analysis: str = Field(min_length=20, max_length=1000)
    axis_x: str = Field(max_length=100)
    axis_y: str = Field(max_length=100)
    competitors: list[Competitor] = Field(default_factory=list, max_length=15)
    crowdedness: Literal["unknown", "sparse", "moderate", "crowded", "saturated"]
    incumbent_response: str = Field(max_length=500)


class WedgeScores(StrictModel):
    pain_intensity: int = Field(ge=1, le=5)
    reachability: int = Field(ge=1, le=5)
    willingness_to_pay: int = Field(ge=1, le=5)
    competitive_gap: int = Field(ge=1, le=5)
    time_to_revenue: int = Field(ge=1, le=5)
    expansion_potential: int = Field(ge=1, le=5)


class Wedge(StrictModel):
    name: str = Field(max_length=120)
    kind: Literal["segment", "use_case", "channel", "geography", "pricing", "integration"]
    description: str = Field(max_length=500)
    scores: WedgeScores
    why_it_works: str = Field(max_length=500)
    what_must_be_true: list[str] = Field(min_length=1, max_length=5)
    expansion_path: str = Field(max_length=500)


class Moat(StrictModel):
    type: Literal[
        "network_effects",
        "data",
        "switching_costs",
        "brand",
        "regulatory",
        "cost",
        "distribution",
        "technology",
    ]
    strength_today: int = Field(ge=0, le=5)
    months_to_build: int | None = Field(default=None, ge=0, le=240)
    reasoning: str = Field(max_length=400)


class Risk(StrictModel):
    category: Literal[
        "market",
        "product",
        "technical",
        "regulatory",
        "financial",
        "execution",
        "platform",
        "ethical",
        "timing",
    ]
    title: str = Field(max_length=120)
    likelihood: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    early_warning: str = Field(max_length=400)
    mitigation: str = Field(max_length=400)
    kill_criterion: str = Field(max_length=400)


class Regulatory(StrictModel):
    area: str = Field(max_length=100)
    jurisdiction: str = Field(max_length=100)
    requirement: str = Field(max_length=500)
    impact: str = Field(max_length=300)
    source_ids: list[str] = Field(default_factory=list, max_length=5)


class StrategyResult(StrictModel):
    analysis: str = Field(min_length=20, max_length=1500)
    wedges: list[Wedge] = Field(min_length=3, max_length=6)
    moat: list[Moat] = Field(min_length=1, max_length=8)
    risks: list[Risk] = Field(min_length=5, max_length=12)
    why_now: list[str] = Field(default_factory=list, max_length=5)
    regulatory: list[Regulatory] = Field(default_factory=list, max_length=8)


class Claim(StrictModel):
    claim: str = Field(max_length=400)
    quote: str = Field(max_length=400)
    message_id: str = Field(max_length=100)
    maps_to: Literal["sam", "som", "arpu", "ltv_cac", "cac", "revenue", "competition", "other"]
    claimed_value: float | None = None
    explanation: str = Field(max_length=500)


class ClaimSet(StrictModel):
    analysis: str = Field(min_length=20, max_length=1000)
    claims: list[Claim] = Field(default_factory=list, max_length=30)
