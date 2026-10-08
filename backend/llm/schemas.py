from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

InvestorId = Literal["vc", "operator", "customer", "impact"]
Flag = Literal["dodged", "vague", "no_numbers", "unrealistic", "strong"]
Category = Literal[
    "market",
    "unit_economics",
    "traction",
    "team",
    "competition",
    "moat",
    "risk_regulation",
    "go_to_market",
    "funding_use",
    "product",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Reaction(StrictModel):
    id: InvestorId
    reaction: str = Field(min_length=5, max_length=800)
    interest: int = Field(ge=0, le=100)
    status: Literal["interested", "doubtful", "out"]
    challenges: InvestorId | None = None
    challenge_message_id: str | None = Field(default=None, max_length=80)
    challenged_quote: str | None = Field(default=None, max_length=350)


class Question(StrictModel):
    asker: InvestorId
    text: str = Field(min_length=5, max_length=600)
    targets_weakness: str = Field(max_length=150)
    category: Category
    context_message_id: str | None = Field(default=None, max_length=80)
    reason: str = Field(default="", max_length=400)


class FlagEvidence(StrictModel):
    flag: Flag
    quote: str = Field(min_length=1, max_length=350)
    reason: str = Field(max_length=350)
    confidence: float = Field(ge=0, le=1)


class NumericClaim(StrictModel):
    claim: str = Field(max_length=350)
    plausible: bool | None = None
    issue: str | None = Field(default=None, max_length=300)


class AnswerMetrics(StrictModel):
    question_category: Category
    directness: int = Field(ge=0, le=100)
    specificity: int = Field(ge=0, le=100)
    evidence_strength: int = Field(ge=0, le=100)
    numeric_claims: list[NumericClaim] = Field(default_factory=list, max_length=3)
    vague_phrases: list[str] = Field(default_factory=list, max_length=5)
    weakness_tags: list[str] = Field(default_factory=list, max_length=5)


class AskResult(StrictModel):
    analysis: str = Field(min_length=20, max_length=2000)
    flags: list[FlagEvidence] = Field(default_factory=list, max_length=5)
    answer_metrics: AnswerMetrics
    investors: list[Reaction] = Field(min_length=4, max_length=4)
    next_question: Question

    @model_validator(mode="after")
    def unique_investors(self):
        if {i.id for i in self.investors} != {"vc", "operator", "customer", "impact"}:
            raise ValueError("Each investor must appear exactly once")
        return self


class Scorecard(StrictModel):
    team: int = Field(ge=0, le=100)
    market: int = Field(ge=0, le=100)
    traction: int = Field(ge=0, le=100)
    model: int = Field(ge=0, le=100)
    defensibility: int = Field(ge=0, le=100)
    clarity: int = Field(ge=0, le=100)


class Weakness(StrictModel):
    title: str = Field(max_length=150)
    evidence: str = Field(min_length=1, max_length=600)
    action: str = Field(max_length=600)
    category: str = Field(default="", max_length=50)
    message_id: str | None = Field(default=None, max_length=80)
    why_it_matters: str = Field(default="", max_length=500)


class Verdict(StrictModel):
    id: InvestorId
    decision: Literal["in", "out", "conditional"]
    reason: str = Field(min_length=5, max_length=700)


class PrepQuestion(StrictModel):
    question: str = Field(max_length=600)
    suggested_answer: str = Field(max_length=1200)


class FinishResult(StrictModel):
    analysis: str = Field(min_length=20, max_length=2000)
    scorecard: Scorecard
    weaknesses: list[Weakness] = Field(min_length=3, max_length=3)
    verdicts: list[Verdict] = Field(min_length=4, max_length=4)
    rewritten_pitch: str = Field(min_length=30, max_length=2000)
    prep_sheet: list[PrepQuestion] = Field(min_length=5, max_length=5)

    @model_validator(mode="after")
    def unique_verdicts(self):
        if {v.id for v in self.verdicts} != {"vc", "operator", "customer", "impact"}:
            raise ValueError("Each investor needs one verdict")
        return self
