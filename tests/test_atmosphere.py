import asyncio
import copy
import json

import httpx

from backend.config import settings
from backend.deals import negotiate, offers_for
from backend.llm import client
from backend.llm.providers import reasoning_params
from backend.negotiation import DealReaction, react_to_deal
from tests.test_llm import Result


def test_challenges_reference_other_investors_actual_words():
    from backend.pitch import ground_challenges

    messages = [
        {"id": "old", "speaker": "vc", "text": "We need evidence of renewals."},
        {"id": "new", "speaker": "vc", "text": "Acquisition is still unmeasured."},
    ]
    reactions = [
        {"id": "vc", "challenges": "vc", "challenged_quote": "invented"},
        {"id": "impact", "challenges": "customer", "challenge_message_id": "old"},
        {
            "id": "customer",
            "challenges": "vc",
            "challenge_message_id": "old",
            "challenged_quote": "evidence of renewals",
        },
        {
            "id": "operator",
            "challenges": "vc",
            "challenge_message_id": "missing",
            "challenged_quote": "invented quote",
        },
    ]
    ground_challenges(reactions, messages)
    assert reactions[0]["challenges"] is None
    assert reactions[1]["challenge_message_id"] is None
    assert reactions[2]["challenge_message_id"] == "old"
    assert reactions[2]["challenged_quote"] == "evidence of renewals"
    assert reactions[3]["challenge_message_id"] == "new"
    assert reactions[3]["challenged_quote"] == messages[1]["text"]


def test_groq_unsupported_reasoning_is_not_sent():
    assert reasoning_params("groq", "high", "llama-3.3-70b-versatile") == {}
    assert reasoning_params("groq", "medium", "qwen/qwen3.8-27b") == {
        "reasoning_effort": "medium",
        "reasoning_format": "hidden",
    }


def test_groq_model_limit_still_allows_fast_model(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("LLM_REASON_CHAIN", "groq")
    monkeypatch.setenv("LLM_FAST_CHAIN", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "not-a-real-key")
    monkeypatch.setenv("GROQ_REASON_MODEL", "qwen/qwen3.8-27b")
    monkeypatch.setenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
    settings.cache_clear()
    client.cooldowns.clear()
    requests = []

    async def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        if body["model"] == "qwen/qwen3.8-27b":
            return httpx.Response(429, headers={"Retry-After": "300"})
        return httpx.Response(
            200, json={"choices": [{"message": {"content": '{"analysis":"Valid fast fallback", "value":4}'}}]}
        )

    actual = httpx.AsyncClient
    monkeypatch.setattr(
        client.httpx, "AsyncClient", lambda **kwargs: actual(transport=httpx.MockTransport(handler))
    )
    result = asyncio.run(client.call_llm(system="test", messages=[], schema=Result, max_tokens=700))
    assert [r["model"] for r in requests] == ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]
    assert result["meta"]["degraded"] is True
    assert requests[-1]["max_tokens"] == 700
    client.cooldowns.clear()


def pitch():
    value = {
        "idea": "We tested a paid pilot with 12 bakery owners.",
        "investor_state": {id: 80 for id in ("vc", "operator", "customer", "impact")},
        "funding_ask": 100000,
        "equity_offered": 10,
        "inputs": {"cloud_consent": True},
        "report": {
            "verdicts": [
                {"id": id, "decision": "in", "reason": "A promising pilot"}
                for id in ("vc", "operator", "customer", "impact")
            ]
        },
    }
    value["report"]["simulated_offers"] = offers_for(value, value["report"])
    return value


def test_demo_negotiation_reaction_never_calls_provider(monkeypatch):
    async def forbidden(**kwargs):
        raise AssertionError("Demo must stay offline")

    monkeypatch.setattr("backend.negotiation.call_llm", forbidden)
    value = pitch()
    negotiate(value, "vc", "accept")
    terms = copy.deepcopy(value["deal_outcome"])
    asyncio.run(react_to_deal(value, "vc", "accept"))
    assert value["deal_outcome"] == terms
    assert value["negotiation_reaction"]["position"] == "accepted"
    assert value["negotiation_reaction"]["meta"]["is_demo"] is True


def test_model_dialogue_cannot_change_rejected_counter(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    settings.cache_clear()

    async def invented(**kwargs):
        return {
            "data": DealReaction(
                position="accepted", text="I accept your proposal and will invest 999999999."
            ),
            "meta": {"provider": "groq", "is_demo": False},
        }

    monkeypatch.setattr("backend.negotiation.call_llm", invented)
    value = pitch()
    negotiate(value, "vc", "counter", 900000, 1)
    offers = copy.deepcopy(value["report"]["simulated_offers"])
    asyncio.run(react_to_deal(value, "vc", "counter"))
    assert value["report"]["simulated_offers"] == offers
    assert value["negotiation_reaction"]["position"] == "open"
    assert "999999999" not in value["negotiation_reaction"]["text"]
    assert value["negotiation_reaction"]["meta"]["is_demo"] is True


def test_valid_dialogue_and_unavailable_dialogue_preserve_terms(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    settings.cache_clear()
    value = pitch()
    negotiate(value, "vc", "accept")

    async def valid(**kwargs):
        return {
            "data": DealReaction(
                position="accepted",
                text="I'm in. Your bakery pilot gives us a starting point; now make the distribution repeatable.",
            ),
            "meta": {"provider": "groq", "is_demo": False},
        }

    monkeypatch.setattr("backend.negotiation.call_llm", valid)
    asyncio.run(react_to_deal(value, "vc", "accept"))
    assert value["negotiation_reaction"]["meta"]["provider"] == "groq"

    async def unavailable(**kwargs):
        raise client.LLMUnavailable("Limit reached")

    monkeypatch.setattr("backend.negotiation.call_llm", unavailable)
    asyncio.run(react_to_deal(value, "vc", "accept"))
    assert value["deal_outcome"]["status"] == "accepted"
    assert value["negotiation_reaction"]["meta"]["is_demo"] is True
