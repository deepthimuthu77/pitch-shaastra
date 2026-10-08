import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.analysis.defaults import default_assumptions
from backend.analysis.models import compute
from backend.analysis.service import run_analysis
from backend.main import app
from backend.store import store

IDEA = "Our team interviewed 12 bakery owners and tested a paid stock planning pilot at $50 per month. We have not measured long-term retention yet."


def guest(client):
    value = client.post("/api/auth/guest").json()
    return {"Authorization": "Bearer " + value["token"]}, value["uid"]


@pytest.mark.parametrize("model", ["subscription", "marketplace", "one_time", "hardware", "services"])
def test_model_selection_and_known_cash(model):
    assumptions = {
        a["key"]: a["value"]
        for a in default_assumptions(
            {
                "currency": "USD",
                "business_model": model,
                "initial_cash": 1000,
            }
        )
    }
    result = compute(assumptions, months=12, runs=30, business_model=model)
    assert result["metadata"]["business_model"] == model
    assert all(row["revenue"] >= 0 for row in result["scenarios"]["base"]["rows"])
    assert result["scenarios"]["base"]["initial_cash"] == 1000
    assert result["scenarios"]["base"]["runway_status"] != "unknown"
    assert result["simulation"]["runs"] == 30


def test_evidence_is_supplied_before_verdict_and_practice_is_isolated(monkeypatch):
    seen = {}
    from backend.pitch import finish_pitch as original

    async def checked(pitch, grounding=None, claim_checks=None):
        seen["claims"] = claim_checks
        seen["research"] = grounding
        return await original(pitch, grounding, claim_checks=claim_checks)

    monkeypatch.setattr("backend.main.finish_pitch", checked)
    with TestClient(app) as client:
        headers, uid = guest(client)
        other, _ = guest(client)
        pitch = client.post("/api/pitch/start", headers=headers, json={"idea": IDEA}).json()
        asyncio.run(run_analysis(uid, pitch["analysis_id"]))
        finished = client.post("/api/pitch/finish", headers=headers, json={"pitch_id": pitch["id"]})
        assert finished.status_code == 200, finished.text
        assert isinstance(seen["claims"], list)
        assert "sections" in seen["research"]
        data = finished.json()
        assert data["report"]["readiness"]["method"]
        assert data["report"]["improvement_plan"]
        practice = {"pitch_id": pitch["id"], "category": "unit_economics"}
        assert client.post("/api/pitch/practice", headers=other, json=practice).status_code == 404
        focused = client.post("/api/pitch/practice", headers=headers, json=practice)
        assert focused.status_code == 200, focused.text
        assert focused.json()["id"] != pitch["id"]
        assert focused.json()["next_question"]["category"] == "unit_economics"
        assert focused.json()["parent_pitch_id"] == pitch["id"]


def test_flag_review_is_auditable_and_owner_only():
    with TestClient(app) as client:
        headers, _ = guest(client)
        other, _ = guest(client)
        pitch = client.post(
            "/api/pitch/start",
            headers=headers,
            json={"idea": "We have a huge market and no competitors. Everyone needs this application."},
        ).json()
        founder = pitch["messages"][0]
        assert founder["flags"]
        request = {
            "pitch_id": pitch["id"],
            "message_id": founder["id"],
            "flag_index": 0,
            "decision": "dismiss",
            "reason": "This sentence was an example, not our claim.",
        }
        assert client.post("/api/pitch/flag-review", headers=other, json=request).status_code == 404
        response = client.post("/api/pitch/flag-review", headers=headers, json=request)
        assert response.status_code == 200, response.text
        flag = response.json()["messages"][0]["flags"][0]
        assert flag["review"]["decision"] == "dismiss"
        assert flag["review"]["reason"] == request["reason"]
        request["message_id"] = "unknown"
        assert client.post("/api/pitch/flag-review", headers=headers, json=request).status_code == 422


def test_benchmarks_only_use_consented_real_participants():
    async def fixture(uid, org_id):
        members = []
        for index in range(5):
            member_uid = uid if index == 0 else f"participant-{index}"
            members.append({"uid": member_uid, "alias": "Test", "share_metrics": True})
            for attempt in range(2):
                score = 50 + index * 5 + attempt
                await store().put(
                    member_uid,
                    "pitches",
                    f"pitch-{index}-{attempt}",
                    {
                        "id": f"pitch-{index}-{attempt}",
                        "title": "Test",
                        "created_at": attempt,
                        "is_synthetic": False,
                        "report": {
                            "overall_score": score,
                            "scorecard": dict.fromkeys(
                                ["team", "market", "traction", "model", "defensibility", "clarity"], score
                            ),
                        },
                        "messages": [],
                        "attempt_number": attempt + 1,
                        "difficulty": "vc",
                        "idea": IDEA,
                    },
                )
        await store().put(
            "system",
            "orgs",
            org_id,
            {
                "id": org_id,
                "name": "Test cohort",
                "owner": uid,
                "members": members,
            },
        )
        await store().put(uid, "memberships", org_id, {"id": org_id, "name": "Test cohort", "role": "owner"})

    with TestClient(app) as client:
        headers, uid = guest(client)
        org_id = "testcohort"
        asyncio.run(fixture(uid, org_id))
        data = client.get("/api/analytics/overview", headers=headers).json()
        assert data["benchmark"]["available"]
        assert data["cohorts"][0]["average_score"] == 61
        assert data["cohorts"][0]["your_comparison"]["score_delta"] == -10
        asyncio.run(
            store().put(
                "system",
                "orgs",
                org_id,
                {
                    "id": org_id,
                    "name": "Test cohort",
                    "owner": uid,
                    "members": [{"uid": uid, "alias": "Test", "share_metrics": False}],
                },
            )
        )
        data = client.get("/api/analytics/overview", headers=headers).json()
        assert not data["benchmark"]["available"]
        assert "average_score" not in data["cohorts"][0]


def test_negotiation_limits_and_single_accepted_offer():
    with TestClient(app) as client:
        headers, _ = guest(client)
        other, _ = guest(client)
        pitch = client.post(
            "/api/pitch/start",
            headers=headers,
            json={
                "idea": IDEA,
                "funding_ask": 20000,
                "equity_offered": 15,
            },
        ).json()
        finished = client.post("/api/pitch/finish", headers=headers, json={"pitch_id": pitch["id"]}).json()
        offers = finished["report"]["simulated_offers"]
        assert offers
        offer = offers[0]
        request = {
            "pitch_id": pitch["id"],
            "investor_id": offer["investor_id"],
            "action": "counter",
            "amount": offer["amount"],
            "equity_percent": offer["equity_percent"],
        }
        assert client.post("/api/pitch/deal", headers=other, json=request).status_code == 404
        assert (
            client.post("/api/pitch/deal", headers=headers, json={**request, "equity_percent": 0}).status_code
            == 422
        )
        countered = client.post("/api/pitch/deal", headers=headers, json=request)
        assert countered.status_code == 200, countered.text
        assert countered.json()["report"]["simulated_offers"][0]["status"] == "countered"
        accepted = client.post("/api/pitch/deal", headers=headers, json={**request, "action": "accept"})
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["simulation_phase"] == "debrief"
        assert sum(o["status"] == "accepted" for o in accepted.json()["report"]["simulated_offers"]) == 1
        assert (
            client.post("/api/pitch/deal", headers=headers, json={**request, "action": "accept"}).status_code
            == 422
        )


def test_mid_answer_checks_are_idempotent_without_scoring_partial_text():
    with TestClient(app) as client:
        headers, _ = guest(client)
        pitch = client.post("/api/pitch/start", headers=headers, json={"idea": IDEA}).json()
        request = {
            "pitch_id": pitch["id"],
            "partial_answer": "We have a huge market and everyone needs this.",
            "request_id": "interjection-check",
        }
        result = client.post("/api/pitch/interject", headers=headers, json=request)
        assert result.status_code == 200, result.text
        assert result.json()["interruption_kind"] == "offline_rules"
        assert client.post("/api/pitch/interject", headers=headers, json=request).json() == result.json()
        after = client.get(f"/api/pitches/{pitch['id']}", headers=headers).json()
        assert after["answer_count"] == 0
        assert after["investor_state"] == pitch["investor_state"]
        assert after["messages"] == pitch["messages"]


@pytest.mark.parametrize(
    "answer",
    [
        "An example of a bad pitch is 'no competitors'; that is not our claim.",
        "We do not claim a huge market or no competitors. We need research.",
        "We have not measured acquisition cost yet. We will test it in a pilot.",
        "Our measured customer count grew 150% from 20 to 50 year over year.",
    ],
)
def test_uncertainty_examples_and_growth_are_not_false_accusations(answer):
    from backend.pitch import demo_ask

    pitch = {
        "difficulty": "vc",
        "messages": [],
        "investor_state": dict.fromkeys(["vc", "operator", "customer", "impact"], 55),
        "next_question": {"category": "unit_economics"},
        "answer_count": 0,
    }
    result = demo_ask(pitch, answer)
    assert not any(flag.flag in {"vague", "dodged", "unrealistic"} for flag in result.flags)


def test_feature_matrix_rejects_unrelated_evidence_and_cagr_matches_geography():
    from backend.analysis.insights import feature_matrix, market_insights

    facts = [
        {
            "id": "f1",
            "topic": "market",
            "confidence": "high",
            "geography": "US",
            "metric": "market_size",
            "value": 100,
            "year": 2024,
            "unit": "USD",
            "source_id": "s1",
            "note": "Measured market size",
        },
        {
            "id": "f2",
            "topic": "market",
            "confidence": "high",
            "geography": "US",
            "metric": "market_size",
            "value": 121,
            "year": 2026,
            "unit": "USD",
            "source_id": "s2",
            "note": "Measured market size",
        },
    ]
    assert market_insights(facts, "US")["growth"]["cagr"] == pytest.approx(0.1)
    assert market_insights(facts, "India")["growth"]["cagr"] is None
    matrix = feature_matrix(
        [{"name": "Example", "source_ids": ["s1"]}],
        facts,
        {
            "features": ["Workflow"],
            "cells": [
                {
                    "competitor": "Example",
                    "feature": "Workflow",
                    "fact_id": "f1",
                    "evidence_quote": "Measured market size",
                }
            ],
        },
    )
    assert matrix["rows"][0]["cells"][0]["status"] == "unknown"
