import asyncio
import json

from backend.config import settings
from backend.google_services import load_secrets
from backend.llm.client import call_llm
from backend.llm.providers import chain, provider
from backend.llm.schemas import AskResult
from backend.prompts.investors import panel_prompt


async def main():
    if settings().app_mode == "demo":
        print("Demo mode: no model requests made. Set APP_MODE=live and configure Firebase + provider keys.")
        return
    await load_secrets()
    results = []
    for name in chain("reason"):
        if not provider(name, "reason")["key"]:
            results.append({"provider": name, "status": "not configured"})
            continue
        try:
            out = await call_llm(
                system=panel_prompt("vc"),
                messages=[
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "latest_answer": "We target a huge market and have no competitors. We haven't measured our acquisition costs yet.",
                                "last_question": {
                                    "category": "market",
                                    "text": "How many reachable paying customers are there?",
                                },
                                "investor_state": {id: 55 for id in ("vc", "operator", "customer", "impact")},
                            }
                        ),
                    }
                ],
                schema=AskResult,
                max_tokens=2600,
                only_provider=name,
                allow_degrade=False,
            )
            results.append({"status": "valid structured response", **out["meta"]})
        except Exception as error:
            results.append({"provider": name, "status": "unavailable", "error_type": type(error).__name__})
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
