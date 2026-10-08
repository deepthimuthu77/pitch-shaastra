import asyncio
import json
import time

import httpx

from backend.config import settings
from backend.llm.parse import extract_json, split_think
from backend.llm.providers import chain, provider, reasoning_params

cooldowns = {}


class LLMUnavailable(Exception):
    pass


async def call_llm(
    *, system, messages, schema, effort="medium", tier="reason", allow_degrade=True, only_provider=None
):
    if settings().app_mode == "demo":
        raise LLMUnavailable("Demo mode never calls external model providers")
    started = time.perf_counter()
    failures = []
    tiers = [tier] + (["fast"] if tier == "reason" and allow_degrade else [])

    async def run():
        async with httpx.AsyncClient(timeout=settings().llm_timeout) as client:
            for current_tier in tiers:
                for name in [only_provider] if only_provider else chain(current_tier):
                    config = provider(name, current_tier)
                    if not config["key"] or not config["model"] or cooldowns.get(name, 0) > time.monotonic():
                        continue
                    body = {
                        "model": config["model"],
                        "messages": [
                            {
                                "role": "system",
                                "content": system
                                + "\nReturn JSON matching this schema:\n"
                                + json.dumps(schema.model_json_schema()),
                            },
                            *messages,
                        ],
                        "max_tokens": 6000,
                        "response_format": {"type": "json_object"},
                        **reasoning_params(name, effort),
                    }
                    headers = {"Authorization": "Bearer " + config["key"], "X-Title": "PitchGrill"}
                    stripped, repaired = False, False
                    for _ in range(3):
                        try:
                            response = await client.post(config["url"], headers=headers, json=body)
                            if response.status_code == 429:
                                try:
                                    wait = min(300, max(15, float(response.headers.get("retry-after", "30"))))
                                except ValueError:
                                    wait = 30
                                cooldowns[name] = time.monotonic() + wait
                            if response.status_code == 400 and not stripped:
                                body.pop("reasoning_effort", None)
                                body.pop("reasoning", None)
                                body.pop("response_format", None)
                                stripped = True
                                continue
                            response.raise_for_status()
                            payload = response.json()
                            message = payload["choices"][0]["message"]
                            text = split_think(message.get("content"))
                            try:
                                result = schema.model_validate(extract_json(text))
                            except ValueError:
                                if repaired:
                                    raise
                                body["messages"] = [
                                    *body["messages"],
                                    {"role": "assistant", "content": text[:20_000]},
                                    {
                                        "role": "user",
                                        "content": "Output failed schema validation. Return a complete corrected JSON object only, with every required field and no extra fields.",
                                    },
                                ]
                                repaired = True
                                continue
                            usage = payload.get("usage") or {}
                            reasoning_tokens = (usage.get("completion_tokens_details") or {}).get(
                                "reasoning_tokens"
                            )
                            return {
                                "data": result,
                                "meta": {
                                    "provider": name,
                                    "model": config["model"],
                                    "ms": round((time.perf_counter() - started) * 1000),
                                    "reasoning_tokens": reasoning_tokens,
                                    "input_tokens": usage.get("prompt_tokens"),
                                    "output_tokens": usage.get("completion_tokens"),
                                    "effort": effort,
                                    "tier": current_tier,
                                    "degraded": current_tier != tier or stripped,
                                    "is_demo": False,
                                    "fallback_count": len(failures),
                                    "summary": result.analysis[:1000]
                                    if hasattr(result, "analysis")
                                    else None,
                                },
                            }
                        except (httpx.HTTPError, ValueError, KeyError, IndexError):
                            failures.append(name)
                            break
            raise LLMUnavailable(
                "All configured providers are unavailable. Check Setup and provider quotas; your session is saved."
            )

    try:
        return await asyncio.wait_for(run(), settings().llm_total_timeout)
    except TimeoutError:
        raise LLMUnavailable(
            "Model request exceeded the time budget. Retry; your session is saved."
        ) from None
