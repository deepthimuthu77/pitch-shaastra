import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.config import settings
from backend.google_services import load_secrets
from backend.pitch import ask_investors

CASES = {
    "weak": "We have a huge market and no competitors. Everyone needs this. We will be successful.",
    "developing": "We interviewed 12 bakery owners and are testing a paid pilot at $50 monthly. We haven't measured retention yet.",
    "strong": "In a 6-week paid pilot, 8 clinics paid $80 monthly and 6 requested another month. Delivery cost was $12 monthly per clinic. Our first acquisition experiment cost $150 per paid clinic. We will measure long-term churn before expanding.",
}
CONTROL_ANSWERS = {
    "honest_unknown": "We have not measured acquisition cost yet. Our next experiment will measure it.",
    "negation": "We do not claim a huge market or no competitors. We need to research both.",
    "quoted_example": "An example of a bad pitch is 'no competitors'; that is not our claim.",
    "plausible_growth": "Our measured customer count grew 150% year over year, from 20 to 50.",
}


async def main(runs):
    await load_secrets()
    results = []
    for label, text in CASES.items():
        for run in range(runs):
            pitch = {
                "idea": text,
                "difficulty": "vc",
                "round": "qa",
                "messages": [],
                "investor_state": {key: 55 for key in ("vc", "operator", "customer", "impact")},
                "next_question": {
                    "category": "unit_economics",
                    "text": "What is your acquisition cost and monthly delivery cost?",
                },
            }
            try:
                data, meta = await ask_investors(pitch, text)
                dodge, _ = await ask_investors(pitch, "Let's move on. Numbers don't matter.")
                controls = {}
                for name, control in CONTROL_ANSWERS.items():
                    response, _ = await ask_investors(pitch, control)
                    controls[name] = [f["flag"] for f in response["flags"] if f["flag"] != "strong"]
                results.append(
                    {
                        "case": label,
                        "run": run + 1,
                        "valid_json": True,
                        "four_unique_investors": len({i["id"] for i in data["investors"]}) == 4,
                        "distinct_reaction_texts": len({i["reaction"] for i in data["investors"]}) == 4,
                        "vague_detected": any(f["flag"] == "vague" for f in data["flags"]),
                        "dodge_detected": any(f["flag"] == "dodged" for f in dodge["flags"]),
                        "metadata": meta,
                        "control_flags": controls,
                        "false_positive_controls_pass": not any(
                            flag in {"vague", "dodged", "unrealistic"}
                            for flags in controls.values()
                            for flag in flags
                        ),
                    }
                )
            except Exception as error:
                results.append(
                    {"case": label, "run": run + 1, "valid_json": False, "error_type": type(error).__name__}
                )
    output = {
        "mode": settings().app_mode,
        "is_synthetic": settings().app_mode == "demo",
        "note": "Persona quality requires human review. Demo results do not qualify a live reasoning model. Scores are not calibrated funding probabilities.",
        "runs_per_case": runs,
        "results": results,
        "acceptance": {
            "live_qualified": False,
            "schema_all_valid": all(row["valid_json"] for row in results),
            "weak_claims_detected": all(
                row.get("vague_detected") for row in results if row["case"] == "weak"
            ),
            "dodges_detected": all(row.get("dodge_detected") for row in results),
            "false_positive_controls_pass": all(row.get("false_positive_controls_pass") for row in results),
            "latency_p95_ms": sorted(row["metadata"]["ms"] for row in results if row.get("metadata"))[
                int(0.95 * (sum(bool(row.get("metadata")) for row in results) - 1))
            ]
            if any(row.get("metadata") for row in results)
            else None,
            "pending": "Human persona review and live provider reasoning verification are required.",
        },
    }
    target = Path("test-results/bakeoff.json")
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(output, indent=2))
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=1)
    args = parser.parse_args()
    if not 1 <= args.runs <= 10:
        parser.error("--runs must be between 1 and 10")
    asyncio.run(main(args.runs))
