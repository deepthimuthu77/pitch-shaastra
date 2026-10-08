from backend.analysis.schemas import Assumption

DEFAULTS = {
    "tam_top_down": ("Published total market", "currency/year", None),
    "sam_fraction": ("Serviceable market fraction", "fraction", (0.02, 0.05, 0.1)),
    "som_fraction": ("Obtainable serviceable fraction", "fraction", (0.01, 0.03, 0.08)),
    "target_accounts": ("Reachable target accounts", "accounts", (1000, 5000, 15000)),
    "adoption_share": ("Expected segment adoption", "fraction", (0.01, 0.05, 0.15)),
    "max_penetration": ("Maximum target penetration", "fraction", (0.02, 0.08, 0.2)),
    "new_customers_start": ("New customers in first month", "accounts/month", (2, 5, 12)),
    "new_growth_monthly": ("Monthly acquisition growth", "fraction/month", (0.01, 0.05, 0.10)),
    "monthly_churn": ("Monthly customer churn", "fraction/month", (0.01, 0.03, 0.08)),
    "arpu_month": ("Monthly revenue per customer", "currency/month", (20, 50, 100)),
    "monthly_expansion": ("Monthly revenue expansion", "fraction/month", (0, 0.002, 0.005)),
    "gross_margin": ("Gross margin", "fraction", (0.5, 0.7, 0.85)),
    "cac": ("Customer acquisition cost", "currency/account", (60, 150, 400)),
    "fixed_costs_month": ("Monthly fixed operating cost", "currency/month", (1000, 3000, 7000)),
}


def default_assumptions(inputs):
    multiplier = 80 if inputs.get("currency") == "INR" else 1
    result = []
    for key, (label, unit, values) in DEFAULTS.items():
        if values and unit.startswith("currency"):
            values = tuple(v * multiplier for v in values)
        entry = {
            "key": key,
            "label": label,
            "unit": unit.replace("currency", inputs.get("currency", "USD")),
            "value": dict(zip(("low", "base", "high"), values)) if values else None,
            "provenance": "model_default",
            "fact_ids": [],
            "rationale": "Illustrative planning input, not researched market data. Replace with your own measurement."
            if values
            else "No published market size found. Top-down estimate stays unavailable.",
        }
        if values and multiplier != 1 and unit.startswith("currency"):
            entry["rationale"] += (
                " INR defaults use an arbitrary planning scale, not a current foreign-exchange rate."
            )
        if key == "arpu_month" and inputs.get("price_guess") is not None:
            price = inputs["price_guess"]
            entry.update(
                value={"low": price * 0.8, "base": price, "high": price * 1.2},
                provenance="founder",
                rationale="Founder-provided price hypothesis with an illustrative uncertainty range.",
            )
        result.append(Assumption.model_validate(entry).model_dump())
    return result


def demo_strategy(profile):
    return {
        "analysis": "Illustrative coaching hypotheses derived from the supplied customer segment. No competitive or legal research has been performed.",
        "wedges": [
            {
                "name": name,
                "kind": kind,
                "description": description,
                "scores": dict(
                    zip(
                        (
                            "pain_intensity",
                            "reachability",
                            "willingness_to_pay",
                            "competitive_gap",
                            "time_to_revenue",
                            "expansion_potential",
                        ),
                        scores,
                    )
                ),
                "why_it_works": "Focuses learning on a narrow reachable segment; validate these subjective scores through interviews.",
                "what_must_be_true": [
                    "Customers have an urgent recurring problem",
                    "A practical acquisition channel reaches the buyer",
                ],
                "expansion_path": "A focused pilot → a repeatable use case → adjacent customer segments",
            }
            for name, kind, description, scores in [
                (
                    "Focused early adopters",
                    "segment",
                    "Start with the smallest group that has the strongest need.",
                    (5, 4, 3, 3, 4, 3),
                ),
                (
                    "Workflow integration",
                    "integration",
                    "Meet customers inside a workflow they already use.",
                    (4, 3, 4, 4, 3, 4),
                ),
                (
                    "Local beachhead",
                    "geography",
                    "Validate distribution in one reachable geography first.",
                    (4, 4, 3, 3, 4, 4),
                ),
            ]
        ],
        "moat": [
            {
                "type": "distribution",
                "strength_today": 1,
                "months_to_build": None,
                "reasoning": "No distribution advantage is demonstrated yet. Interview and retention evidence can change this assessment.",
            },
            {
                "type": "switching_costs",
                "strength_today": 1,
                "months_to_build": None,
                "reasoning": "Workflow adoption may create switching costs, but this is a hypothesis to test.",
            },
        ],
        "risks": [
            {
                "category": category,
                "title": title,
                "likelihood": likelihood,
                "impact": impact,
                "early_warning": warning,
                "mitigation": mitigation,
                "kill_criterion": kill,
            }
            for category, title, likelihood, impact, warning, mitigation, kill in [
                (
                    "market",
                    "Willingness to pay remains untested",
                    4,
                    4,
                    "Prospects praise the idea but avoid a paid pilot",
                    "Test a narrow paid offer",
                    "No repeatable buyer pain after an agreed validation sprint",
                ),
                (
                    "financial",
                    "Acquisition cost may exceed lifetime value",
                    3,
                    4,
                    "Paid acquisition costs rise while retention stalls",
                    "Measure cohorts before scaling spend",
                    "Repeated cohorts cannot support contribution margin",
                ),
                (
                    "execution",
                    "Scope may exceed team capacity",
                    3,
                    3,
                    "Milestones drift without customer learning",
                    "Choose one workflow and one milestone",
                    "Team cannot deliver a reliable core workflow",
                ),
                (
                    "ethical",
                    "Sensitive customer data could be misused",
                    3,
                    5,
                    "More data is collected than the use case requires",
                    "Minimize collection and test consent and deletion",
                    "Safeguards cannot reduce harm to an acceptable level",
                ),
                (
                    "platform",
                    "Dependency on one provider or channel",
                    3,
                    3,
                    "Pricing or API policy changes break economics",
                    "Build an exit path and cost limits",
                    "No viable substitute at a sustainable price",
                ),
            ]
        ],
        "why_now": [
            "Validate the proposed timing driver with a primary source before treating it as an advantage."
        ],
        "regulatory": [
            {
                "area": "Privacy and customer consent",
                "jurisdiction": "Chosen geography",
                "requirement": "No jurisdiction-specific legal requirement was researched in demo mode. Seek professional review for the actual use case.",
                "impact": "Avoid collecting sensitive information until safeguards are established.",
                "source_ids": [],
            }
        ],
    }
