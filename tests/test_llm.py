import asyncio

import httpx

from backend.config import settings
from backend.llm import client
from backend.llm.parse import extract_json
from backend.llm.schemas import StrictModel


class Result(StrictModel):
    analysis: str
    value: int


def test_json_parser_handles_braces_inside_strings_and_think_blocks():
    assert extract_json(
        '<think>hidden {thought}</think>```json\n{"analysis":"quoted } {", "value":1}\n```'
    ) == {"analysis": "quoted } {", "value": 1}


def test_provider_cooldown_fallback_and_real_metadata(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("LLM_REASON_CHAIN", "gemini,groq")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_REASON_MODEL", "test-reason-model")
    settings.cache_clear()
    client.cooldowns.clear()
    requests = []

    async def handler(request):
        requests.append(str(request.url))
        if "googleapis" in str(request.url):
            return httpx.Response(429, headers={"Retry-After": "60"})
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": '{"analysis":"A concise public assessment", "value":7}'}}
                ],
                "usage": {
                    "prompt_tokens": 42,
                    "completion_tokens": 30,
                    "completion_tokens_details": {"reasoning_tokens": 18},
                },
            },
        )

    actual = httpx.AsyncClient
    monkeypatch.setattr(
        client.httpx, "AsyncClient", lambda **kwargs: actual(transport=httpx.MockTransport(handler))
    )
    result = asyncio.run(client.call_llm(system="test", messages=[], schema=Result))
    assert result["data"].value == 7
    assert result["meta"]["reasoning_tokens"] == 18
    assert result["meta"]["provider"] == "groq"
    assert client.cooldowns["gemini"] > 0
    assert len(requests) == 2


def test_invalid_json_repaired_once(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    settings.cache_clear()
    client.cooldowns.clear()
    calls = []

    async def handler(request):
        calls.append(request)
        content = "invalid" if len(calls) == 1 else '{"analysis":"Schema repaired", "value":3}'
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    actual = httpx.AsyncClient
    monkeypatch.setattr(
        client.httpx, "AsyncClient", lambda **kwargs: actual(transport=httpx.MockTransport(handler))
    )
    result = asyncio.run(client.call_llm(system="test", messages=[], schema=Result, only_provider="gemini"))
    assert result["data"].value == 3
    assert len(calls) == 2
    assert result["meta"]["reasoning_tokens"] is None


def test_short_rate_limit_retries_without_switching_models(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_REASON_MODEL", "qwen/qwen3.8-27b")
    settings.cache_clear()
    client.cooldowns.clear()
    calls, waits = [], []

    async def sleep(seconds):
        waits.append(seconds)

    async def handler(request):
        import json

        body = json.loads(request.content)
        calls.append(body)
        if len(calls) == 1:
            return httpx.Response(429, headers={"Retry-After": "15"})
        return httpx.Response(
            200, json={"choices": [{"message": {"content": '{"analysis":"Valid bounded retry", "value":3}'}}]}
        )

    actual = httpx.AsyncClient
    monkeypatch.setattr(
        client.httpx, "AsyncClient", lambda **kwargs: actual(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(client.asyncio, "sleep", sleep)
    result = asyncio.run(
        client.call_llm(system="test", messages=[], schema=Result, only_provider="groq", allow_degrade=False)
    )
    assert result["meta"]["model"] == "qwen/qwen3.8-27b"
    assert waits == [15]
    assert len(calls) == 2
    assert calls[0]["response_format"]["json_schema"]["strict"] is True
    assert calls[0]["response_format"]["json_schema"]["schema"]["additionalProperties"] is False
    assert result["data"].value == 3
    client.cooldowns.clear()
