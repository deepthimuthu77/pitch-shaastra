import asyncio
import json
import logging
import time

import httpx

from backend.config import settings
from backend.llm.parse import extract_json, split_think
from backend.llm.providers import chain, output_format, provider, reasoning_params

cooldowns = {}
logger = logging.getLogger("pitchgrill.llm")


class LLMUnavailable(Exception):
    pass


async def call_llm(
    *,
    system,
    messages,
    schema,
    effort="medium",
    tier="reason",
    allow_degrade=True,
    only_provider=None,
    max_tokens=6000,
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
                    cooldown_key = (name, config["model"]) if name == "groq" else name
                    if (
                        not config["key"]
                        or not config["model"]
                        or cooldowns.get(cooldown_key, 0) > time.monotonic()
                    ):
                        continue
                    format = output_format(name, config["model"], schema)
                    schema_instruction = "\nReturn only JSON matching the supplied schema. No additional fields. Keep the public assessment concise."
                    if format["type"] == "json_object":
                        schema_instruction += "\n" + json.dumps(schema.model_json_schema())
                    body = {
                        "model": config["model"],
                        "messages": [
                            {
                                "role": "system",
                                "content": system + schema_instruction,
                            },
                            *messages,
                        ],
                        "max_tokens": max_tokens,
                        "response_format": format,
                        **reasoning_params(name, effort, config["model"]),
                    }
                    headers = {"Authorization": "Bearer " + config["key"], "X-Title": "PitchGrill"}
                    stripped, repaired, rate_retried = False, False, False
                    for _ in range(3):
                        try:
                            response = await client.post(config["url"], headers=headers, json=body)
                            if response.status_code == 429:
                                try:
                                    wait = min(300, max(15, float(response.headers.get("retry-after", "30"))))
                                except ValueError:
                                    wait = 30
                                cooldowns[cooldown_key] = time.monotonic() + wait
                                if (
                                    not rate_retried
                                    and wait + time.perf_counter() - started + 5
                                    < settings().llm_total_timeout
                                ):
                                    rate_retried = True
                                    await asyncio.sleep(wait)
                                    continue
                            if response.status_code == 400 and not stripped:
                                body.pop("reasoning_effort", None)
                                body.pop("reasoning", None)
                                body.pop("reasoning_format", None)
                                body.pop("response_format", None)
                                if format["type"] == "json_schema":
                                    body["messages"][0]["content"] += (
                                        "\nRequired JSON schema:\n" + json.dumps(schema.model_json_schema())
                                    )
                                stripped = True
                                continue
                            response.raise_for_status()
                            payload = response.json()
                            message = payload["choices"][0]["message"]
                            text = split_think(message.get("content"))
                            try:
                                result = schema.model_validate(extract_json(text))
                            except ValueError as error:
                                if repaired:
                                    raise
                                body["messages"] = [
                                    *body["messages"],
                                    {"role": "assistant", "content": text[:20_000]},
                                    {
                                        "role": "user",
                                        "content": "Output failed schema validation. Return complete corrected JSON with every required field and no extra fields. Invalid fields: "
                                        + json.dumps(
                                            [{"loc": e["loc"], "type": e["type"]} for e in error.errors()][
                                                :12
                                            ]
                                            if hasattr(error, "errors")
                                            else [{"type": "invalid_json"}]
                                        ),
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
                        except (httpx.HTTPError, ValueError, KeyError, IndexError) as error:
                            logger.warning(
                                "model_unavailable provider=%s model=%s status=%s error_type=%s request_chars=%s",
                                name,
                                config["model"],
                                error.response.status_code
                                if isinstance(error, httpx.HTTPStatusError)
                                else None,
                                type(error).__name__,
                                len(json.dumps(body)),
                            )
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
