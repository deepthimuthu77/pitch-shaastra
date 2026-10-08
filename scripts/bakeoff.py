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
                results.append(
                    {
                        "case": label,
                        "run": run + 1,
                        "valid_json": True,
                        "four_unique_voices": len({i["id"] for i in data["investors"]}) == 4,
                        "vague_detected": any(f["flag"] == "vague" for f in data["flags"]),
                        "dodge_detected": any(f["flag"] == "dodged" for f in dodge["flags"]),
                        "metadata": meta,
                    }
                )
            except Exception as error:
                results.append(
                    {"case": label, "run": run + 1, "valid_json": False, "error_type": type(error).__name__}
                )
    output = {
        "mode": settings().app_mode,
        "is_synthetic": settings().app_mode == "demo",
        "note": "Voice distinction requires human review. Demo results do not qualify a live reasoning model.",
        "runs_per_case": runs,
        "results": results,
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
