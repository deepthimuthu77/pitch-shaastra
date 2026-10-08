import asyncio
import csv
import hashlib
import io
import json
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import Field, model_validator

from backend.analysis.insights import beachhead, stability
from backend.analysis.models import compute, wedge_score
from backend.analysis.schemas import Assumption, Range
from backend.analysis.service import STAGES, claim_check, confidence, report, save_section, signals
from backend.coaching import apply_flag_review, enrich_report, practice_question, readiness
from backend.cohorts import personal_benchmarks
from backend.cohorts import router as cohort_router
from backend.config import settings
from backend.deals import negotiate, offers_for
from backend.firebase_guest import router as firebase_guest_router
from backend.google_services import (
    archive_export,
    delete_cloud_data,
    load_secrets,
    publish_metrics,
    queue_cloud_task,
    speech_to_text,
    text_to_speech,
)
from backend.llm.client import LLMUnavailable
from backend.llm.providers import chain, provider
from backend.llm.schemas import Category, StrictModel
from backend.middleware import BodyLimitMiddleware
from backend.negotiation import react_to_deal
from backend.pitch import ask_investors, finish_pitch, message
from backend.prompts.investors import PANEL
from backend.security import demo_token, limiter, protected_user, safe_id
from backend.store import store


@asynccontextmanager
async def lifespan(app):
    settings()
    await load_secrets()
    store()
    stopping = asyncio.Event()
    worker_task = None
    if settings().inline_worker:
        from backend.worker import run_worker

        worker_task = asyncio.create_task(run_worker(stopping))
    try:
        yield
    finally:
        if worker_task:
            from backend.worker import wake_worker

            stopping.set()
            wake_worker()
            try:
                await asyncio.wait_for(worker_task, timeout=10)
            except TimeoutError:
                pass


app = FastAPI(title="PitchGrill", version="1.0.0", lifespan=lifespan)
app.include_router(cohort_router)
app.include_router(firebase_guest_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings().allowed_origins.split(",")],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
    expose_headers=["Content-Disposition"],
)
app.add_middleware(BodyLimitMiddleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    try:
        limiter.check("ip:" + (request.client.host if request.client else "unknown"), 180)
    except HTTPException:
        return Response("Too many requests; please wait", status_code=429, headers={"Retry-After": "60"})
    length = request.headers.get("content-length", "0")
    try:
        if int(length) > 2_000_000:
            return Response("Request too large", status_code=413)
    except ValueError:
        return Response("Invalid content length", status_code=400)
    response = await call_next(request)
    response.headers.update(
        {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
        }
    )
    return response


@app.exception_handler(LLMUnavailable)
async def llm_error(request, exception):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=503, content={"detail": str(exception)})


class AnalysisInput(StrictModel):
    idea: str = Field(min_length=20, max_length=6000)
    title: str = Field(default="", max_length=120)
    geography: str = Field(default="global", max_length=80)
    currency: Literal["USD", "INR"] = "USD"
    locale: Literal["intl", "IN"] = "intl"
    stage: Literal["idea", "prototype", "early_revenue", "growth"] = "idea"
    target_customer: str = Field(default="", max_length=300)
    industry: str = Field(default="software", max_length=100)
    price_guess: float | None = Field(default=None, ge=0, le=1e7)
    business_model: Literal["subscription", "marketplace", "one_time", "hardware", "services"] = (
        "subscription"
    )
    initial_cash: float | None = Field(default=None, ge=0, le=1e12)
    horizon_months: int = Field(default=60, ge=12, le=120)
    known_competitors: str = Field(default="", max_length=300)
    research_terms: str = Field(default="", max_length=180)
    research_consent: bool = False
    named_search_consent: bool = False
    cloud_consent: bool = False
    overrides: dict[str, Range] = Field(default_factory=dict, max_length=21)

    @model_validator(mode="after")
    def validate_overrides(self):
        for key, value in self.overrides.items():
            Assumption.model_validate(
                {
                    "key": key,
                    "label": key,
                    "unit": "input",
                    "value": value,
                    "provenance": "founder",
                    "rationale": "Founder override",
                }
            )
        if self.research_consent and not self.research_terms.strip():
            raise ValueError("Enter approved generic research terms before enabling search")
        return self


class StartInput(AnalysisInput):
    difficulty: Literal["friendly", "vc", "shark"] = "vc"
    parent_pitch_id: str | None = None
    analytics_consent: bool = False
    practice_category: Category | None = None
    funding_ask: float = Field(default=100000, gt=0, le=1e12)
    equity_offered: float = Field(default=10, ge=0.1, le=49)


class AnswerInput(StrictModel):
    pitch_id: str
    answer: str = Field(min_length=1, max_length=5000)
    request_id: str = Field(default_factory=lambda: uuid.uuid4().hex, max_length=100)


class PitchId(StrictModel):
    pitch_id: str


class RecomputeInput(StrictModel):
    overrides: dict[str, Range] = Field(default_factory=dict, max_length=21)
    weights: dict[str, float] | None = None


class ShareInput(StrictModel):
    sections: list[str] = Field(
        default=["market", "revenue", "unit_economics", "competitors", "wedges", "risks", "sources"],
        min_length=1,
        max_length=16,
    )
    expires_hours: int = Field(default=72, ge=1, le=720)


@asynccontextmanager
async def locked(uid, kind, id):
    key = hashlib.sha256(f"{uid}:{kind}:{id}".encode()).hexdigest()
    token = await store().acquire(key)
    if not token:
        raise HTTPException(409, "This session is processing another request. Please wait and retry.")
    try:
        yield
    finally:
        await store().release(key, token)


async def owned(uid, kind, id):
    safe_id(id)
    result = await store().get(uid, kind, id)
    if not result:
        raise HTTPException(404, "Not found")
    return result


async def create_analysis(uid, body, pitch_id=None, parent=None):
    id = uuid.uuid4().hex
    record = {
        "id": id,
        "idea_text": body.idea,
        "title": body.title or body.idea[:80],
        "pitch_id": pitch_id,
        "parent_analysis_id": parent["id"] if parent else None,
        "version": parent["version"] + 1 if parent else 1,
        "inputs": body.model_dump(
            exclude={
                "idea",
                "title",
                "difficulty",
                "parent_pitch_id",
                "analytics_consent",
                "practice_category",
                "funding_ask",
                "equity_offered",
            }
        ),
        "is_synthetic": settings().app_mode == "demo",
        "status": "queued",
        "progress": {stage: {"status": "pending"} for stage in STAGES},
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    await store().put(uid, "analyses", id, record)
    job = await store().enqueue(uid, id)
    if settings().inline_worker:
        from backend.worker import wake_worker

        wake_worker()
    try:
        await queue_cloud_task(job)
    except Exception:
        record["dispatch_note"] = "Cloud task dispatch unavailable; the durable worker will process this job."
        await store().put(uid, "analyses", id, record)
    return id


def live_consent(body):
    if settings().app_mode == "live" and not body.cloud_consent:
        raise HTTPException(
            422, "Consent to send this idea to configured model providers is required in live mode"
        )


@app.get("/health")
async def health():
    worker = await store().get("system", "health", "worker")
    retention = await store().get("system", "health", "retention")
    return {
        "status": "ok",
        "mode": settings().app_mode,
        "storage": settings().storage_backend,
        "worker_ready": bool(worker and time.time() - worker["time"] < 920),
        "retention_ready": bool(retention and retention.get("ready")),
    }


@app.get("/api/config")
async def config():
    config = settings()
    services = [
        (
            "Gemini",
            bool(os.getenv("GEMINI_API_KEY")),
            "Google Search-backed research; optional dialogue only when selected in the provider chain",
            "GEMINI_API_KEY",
            "https://aistudio.google.com/apikey",
        ),
        (
            "Google Search grounding",
            bool(os.getenv("GEMINI_API_KEY")),
            "Cited market and competitor research using approved generic terms",
            "GEMINI_API_KEY + research consent",
            "https://ai.google.dev/gemini-api/docs/google-search",
        ),
        (
            "Firebase Authentication",
            config.app_mode == "live" and bool(config.firebase_project_id),
            "Google sign-in, anonymous guest identity and verified tokens",
            "FIREBASE_PROJECT_ID + web config",
            "https://console.firebase.google.com",
        ),
        (
            "Cloud Firestore",
            config.storage_backend == "firestore",
            "Private user history, reports, versioned sections and durable jobs",
            "STORAGE_BACKEND=firestore + ADC",
            "https://console.firebase.google.com",
        ),
        (
            "Secret Manager",
            bool(config.google_secret_prefix),
            "Load server-side provider keys through workload identity",
            "GOOGLE_SECRET_PREFIX + project + ADC",
            "https://console.cloud.google.com/security/secret-manager",
        ),
        (
            "Cloud Storage",
            bool(config.gcs_bucket),
            "Explicit private report archives with retention",
            "GCS_BUCKET + ADC",
            "https://console.cloud.google.com/storage",
        ),
        (
            "BigQuery",
            bool(config.bigquery_dataset),
            "Opt-in aggregate practice metrics; no transcript or idea text",
            "BIGQUERY_DATASET + ADC",
            "https://console.cloud.google.com/bigquery",
        ),
        (
            "Cloud Speech-to-Text",
            config.google_speech_enabled,
            "Optional recording transcription for browsers without Web Speech",
            "GOOGLE_SPEECH_ENABLED + ADC",
            "https://console.cloud.google.com/speech",
        ),
        (
            "Cloud Text-to-Speech",
            config.google_speech_enabled,
            "Distinct investor voices when browser synthesis is unavailable",
            "GOOGLE_SPEECH_ENABLED + ADC",
            "https://console.cloud.google.com/text-to-speech",
        ),
        (
            "Cloud Tasks",
            bool(config.cloud_tasks_queue),
            "Authenticated durable analysis dispatch to Cloud Run",
            "CLOUD_TASKS_* + Firestore + ADC",
            "https://console.cloud.google.com/cloudtasks",
        ),
        (
            "Cloud Logging",
            config.cloud_logging,
            "Redacted operational events and model-failure monitoring",
            "CLOUD_LOGGING=true + ADC",
            "https://console.cloud.google.com/logs",
        ),
        (
            "Cloud Run / Artifact Registry",
            bool(os.getenv("K_SERVICE")),
            "Container hosting and versioned build artifacts",
            "Deployment commands in docs/google-cloud.md",
            "https://console.cloud.google.com/run",
        ),
    ]
    return {
        "mode": config.app_mode,
        "panel": PANEL,
        "providers": [
            {
                "name": name,
                "model": provider(name, "reason")["model"],
                "configured": bool(provider(name, "reason")["key"]),
                "cooldown": False,
            }
            for name in chain("reason")
        ],
        "services": [
            {
                "name": name,
                "configured": ready,
                "active": ready and config.app_mode == "live",
                "purpose": purpose,
                "needs": needs,
                "url": url,
            }
            for name, ready, purpose, needs, url in services
        ],
        "firebase": {
            "apiKey": os.getenv("NEXT_PUBLIC_FIREBASE_API_KEY", ""),
            "authDomain": os.getenv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", ""),
            "projectId": config.firebase_project_id,
            "appId": os.getenv("NEXT_PUBLIC_FIREBASE_APP_ID", ""),
        },
        "retention_days": config.retention_days,
        "privacy": "Private by default. Live mode sends your idea to configured model providers only with consent. Search uses only your approved generic terms. Demo mode makes no external model or search calls.",
    }


@app.post("/api/auth/guest")
async def guest():
    if settings().app_mode != "demo":
        raise HTTPException(400, "Use Firebase anonymous sign-in in live mode")
    return demo_token()


@app.post("/api/pitch/start")
async def start(body: StartInput, user=Depends(protected_user)):
    live_consent(body)
    limiter.check("sessions:" + user["uid"], settings().max_sessions_per_day, 86400)
    parent = await owned(user["uid"], "pitches", body.parent_pitch_id) if body.parent_pitch_id else None
    if parent and parent["status"] != "finished":
        raise HTTPException(409, "Finish the previous attempt before retrying")
    id = uuid.uuid4().hex
    pitch = {
        "id": id,
        "title": body.title or body.idea[:80],
        "idea": body.idea,
        "difficulty": body.difficulty,
        "status": "active",
        "round": "pitch",
        "investor_state": {p["id"]: 55 for p in PANEL},
        "answer_count": 0,
        "messages": [],
        "created_at": time.time(),
        "is_synthetic": user["mode"] == "demo",
        "parent_pitch_id": body.parent_pitch_id,
        "attempt_number": parent["attempt_number"] + 1 if parent else 1,
        "inputs": body.model_dump(),
        "analytics_consent": body.analytics_consent,
        "practice_category": body.practice_category,
        "interest_history": [],
        "funding_ask": body.funding_ask,
        "equity_offered": body.equity_offered,
        "simulation_phase": "panel",
    }
    result, meta = await ask_investors(pitch, body.idea)
    pitch["messages"].append(
        message(
            "founder",
            body.idea,
            flags=result["flags"],
            metrics=result["answer_metrics"],
            question="Opening pitch",
        )
    )
    for investor in result["investors"]:
        pitch["messages"].append(
            message(
                investor["id"],
                investor["reaction"],
                challenges=investor["challenges"],
                challenge_message_id=investor.get("challenge_message_id"),
                challenged_quote=investor.get("challenged_quote"),
            )
        )
        pitch["investor_state"][investor["id"]] = investor["interest"]
    persist_assessment(pitch, result, pitch["messages"][0]["id"])
    pitch.update(next_question=result["next_question"], llm_meta=meta, round="qa")
    if body.practice_category:
        pitch["next_question"] = practice_question(body.practice_category)
    pitch["analysis_id"] = await create_analysis(user["uid"], body, id)
    await store().put(user["uid"], "pitches", id, pitch)
    return pitch


def persist_assessment(pitch, result, message_id):
    for key in ("weakness_tracker", "deep_dive_focus"):
        if key in result:
            pitch[key] = result[key]
    for item in pitch.get("weakness_tracker", {}).values():
        if item.get("attempts") and not item.get("latest_message_id"):
            item["latest_message_id"] = message_id
    if result.get("next_question") and not result["next_question"].get("context_message_id"):
        result["next_question"]["context_message_id"] = message_id
    point = result.get("trajectory_point")
    if point:
        point.update(message_id=message_id, answer_index=pitch["answer_count"])
        pitch.setdefault("interest_history", []).append(point)


@app.post("/api/pitch/answer")
async def answer(body: AnswerInput, user=Depends(protected_user)):
    safe_id(body.request_id)
    async with locked(user["uid"], "pitch", safe_id(body.pitch_id)):
        pitch = await owned(user["uid"], "pitches", body.pitch_id)
        if any(m.get("request_id") == body.request_id for m in pitch["messages"]):
            return pitch
        if pitch["status"] != "active" or pitch["answer_count"] >= 8:
            raise HTTPException(409, "Finish this session to receive your report")
        analysis = await report(user["uid"], pitch["analysis_id"])
        founder_message = message(
            "founder", body.answer, question=pitch["next_question"]["text"], request_id=body.request_id
        )
        if analysis and analysis["status"] in {"done", "partial"}:
            try:
                pitch["claim_check"] = await claim_check(
                    user["uid"], pitch["analysis_id"], [*pitch["messages"], founder_message]
                )
            except LLMUnavailable:
                pitch["claim_check_note"] = "Claim extraction unavailable for this answer."
        grounding = (
            {
                "profile": analysis.get("profile"),
                "market": analysis["sections"].get("market"),
                "competitors": analysis["sections"].get("competitors"),
                "facts": analysis["sections"].get("facts"),
                "sources": analysis["sections"].get("sources"),
                "claim_check": pitch.get("claim_check", []),
                "warnings": analysis.get("warnings"),
            }
            if analysis and analysis["status"] in {"done", "partial"}
            else None
        )
        result, meta = await ask_investors(pitch, body.answer, grounding)
        founder_message.update(flags=result["flags"], metrics=result["answer_metrics"])
        pitch["messages"].append(founder_message)
        founder_id = pitch["messages"][-1]["id"]
        for investor in result["investors"]:
            pitch["messages"].append(
                message(
                    investor["id"],
                    investor["reaction"],
                    challenges=investor["challenges"],
                    challenge_message_id=investor.get("challenge_message_id"),
                    challenged_quote=investor.get("challenged_quote"),
                )
            )
            pitch["investor_state"][investor["id"]] = investor["interest"]
        pitch["answer_count"] += 1
        persist_assessment(pitch, result, founder_id)
        pitch.update(
            next_question=result["next_question"],
            llm_meta=meta,
            round=result.get("suggested_round", "deepdive" if pitch["answer_count"] >= 3 else "qa"),
        )
        await store().put(user["uid"], "pitches", pitch["id"], pitch)
        return pitch


@app.post("/api/pitch/finish")
async def finish(body: PitchId, user=Depends(protected_user)):
    async with locked(user["uid"], "pitch", safe_id(body.pitch_id)):
        pitch = await owned(user["uid"], "pitches", body.pitch_id)
        if pitch["status"] == "finished":
            return pitch
        analysis = await report(user["uid"], pitch["analysis_id"])
        checks, check_note = [], None
        try:
            checks = await claim_check(user["uid"], pitch["analysis_id"], pitch["messages"])
        except LLMUnavailable:
            check_note = "Claim extraction was unavailable; no missing claim was treated as a contradiction."
        pitch["claim_check"] = checks
        result, meta = await finish_pitch(pitch, analysis, claim_checks=checks)
        result["simulated_offers"] = offers_for(pitch, result)
        pitch["simulation_phase"] = "negotiation"
        pitch.update(
            report=result, llm_meta=meta, round="verdict", status="finished", finished_at=time.time()
        )
        if pitch["parent_pitch_id"]:
            parent = await store().get(user["uid"], "pitches", pitch["parent_pitch_id"])
            if parent and parent.get("report"):
                pitch["comparison"] = {
                    "before": parent["report"]["scorecard"],
                    "after": result["scorecard"],
                    "deltas": {
                        key: result["scorecard"][key] - value
                        for key, value in parent["report"]["scorecard"].items()
                    },
                }
        await store().put(user["uid"], "pitches", pitch["id"], pitch)
        if check_note:
            pitch["report_note"] = check_note
        try:
            await publish_metrics(user["uid"], pitch)
        except Exception:
            pitch["report_note"] = (
                "Report saved. Claim check or optional metrics export was unavailable; retry from the analysis report."
            )
        await store().put(user["uid"], "pitches", pitch["id"], pitch)
        return pitch


@app.post("/api/pitch/prep")
async def prep(body: PitchId, user=Depends(protected_user)):
    pitch = await owned(user["uid"], "pitches", body.pitch_id)
    if not pitch.get("report"):
        raise HTTPException(409, "Finish the pitch first")
    return {"questions": pitch["report"]["prep_sheet"]}


class FlagReviewInput(PitchId):
    message_id: str = Field(max_length=100)
    flag_index: int = Field(ge=0, le=4)
    decision: Literal["dismiss", "restore"] = "dismiss"
    reason: str = Field(min_length=5, max_length=600)


@app.post("/api/pitch/flag-review")
async def review_flag(body: FlagReviewInput, user=Depends(protected_user)):
    async with locked(user["uid"], "pitch", safe_id(body.pitch_id)):
        pitch = await owned(user["uid"], "pitches", body.pitch_id)
        try:
            apply_flag_review(pitch, body.message_id, body.flag_index, body.decision, body.reason)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        pitch["review_note"] = "Founder review recorded; it is not independent verification of the claim."
        if pitch.get("report"):
            pitch["report"] = enrich_report(pitch, pitch["report"], pitch.get("claim_check"))
        await store().put(user["uid"], "pitches", pitch["id"], pitch)
        return pitch


class InterjectInput(PitchId):
    partial_answer: str = Field(min_length=20, max_length=5000)
    request_id: str = Field(min_length=1, max_length=100)


@app.post("/api/pitch/interject")
async def interject(body: InterjectInput, user=Depends(protected_user)):
    async with locked(user["uid"], "interjection", safe_id(body.pitch_id)):
        pitch = await owned(user["uid"], "pitches", body.pitch_id)
        if pitch["status"] != "active":
            raise HTTPException(409, "This pitch is finished")
        cache = await store().list(user["uid"], "interjections_" + pitch["id"], 10)
        existing = next((row for row in cache if row["request_id"] == body.request_id), None)
        if existing:
            return existing
        limiter.check("interject:" + pitch["id"], 1, 10)
        if len(cache) >= 8:
            raise HTTPException(429, "Mid-answer check limit reached for this session")
        result, meta = await ask_investors(pitch, body.partial_answer)
        flag = next((f for f in result["flags"] if f["flag"] != "strong"), None)
        row = {
            "request_id": body.request_id,
            "asker": result["next_question"]["asker"],
            "text": (flag["reason"] + " " if flag else "") + result["next_question"]["text"],
            "quote": flag["quote"] if flag else None,
            "flag": flag["flag"] if flag else None,
            "meta": meta,
            "interruption_kind": "offline_rules" if pitch["is_synthetic"] else "live_model",
        }
        # Store separately so a read of a partial answer cannot overwrite an in-flight full answer.
        await store().put(user["uid"], "interjections_" + pitch["id"], safe_id(body.request_id), row)
        return row


class PracticeInput(PitchId):
    category: Category


@app.post("/api/pitch/practice")
async def practice(body: PracticeInput, user=Depends(protected_user)):
    parent = await owned(user["uid"], "pitches", body.pitch_id)
    if parent["status"] != "finished":
        raise HTTPException(409, "Finish the original pitch before starting focused practice")
    inputs = {**parent["inputs"], "parent_pitch_id": parent["id"], "practice_category": body.category}
    inputs["idea"] = parent["report"]["rewritten_pitch"]
    result = await start(StartInput.model_validate(inputs), user)
    result["practice_context"] = {
        "category": body.category,
        "parent_pitch_id": parent["id"],
        "purpose": "Resolve this weakness with evidence before broadening the rehearsal.",
    }
    await store().put(user["uid"], "pitches", result["id"], result)
    return result


class DealInput(PitchId):
    investor_id: Literal["vc", "operator", "customer", "impact"] = "vc"
    action: Literal["accept", "counter", "decline", "walk_away"]
    amount: float | None = Field(default=None, gt=0, le=1e12)
    equity_percent: float | None = Field(default=None, ge=0.1, le=49)


@app.post("/api/pitch/deal")
async def deal(body: DealInput, user=Depends(protected_user)):
    async with locked(user["uid"], "pitch", safe_id(body.pitch_id)):
        pitch = await owned(user["uid"], "pitches", body.pitch_id)
        if pitch["status"] != "finished" or not pitch.get("report"):
            raise HTTPException(409, "Hear the panel verdict before negotiating")
        try:
            negotiate(pitch, body.investor_id, body.action, body.amount, body.equity_percent)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        await react_to_deal(pitch, body.investor_id, body.action)
        await store().put(user["uid"], "pitches", pitch["id"], pitch)
        return pitch


@app.get("/api/pitches")
async def pitches(user=Depends(protected_user)):
    records = await store().list(user["uid"], "pitches")
    return [{k: value for k, value in item.items() if k not in {"messages", "inputs"}} for item in records]


@app.get("/api/pitches/{id}")
async def pitch_get(id: str, user=Depends(protected_user)):
    return await owned(user["uid"], "pitches", id)


@app.delete("/api/pitches/{id}")
async def pitch_delete(id: str, user=Depends(protected_user)):
    async with locked(user["uid"], "pitch", safe_id(id)):
        await owned(user["uid"], "pitches", id)
        await store().delete(user["uid"], "pitches", id)
        await store().delete_kind(user["uid"], "interjections_" + id)
    return {"deleted": True}


@app.post("/api/analysis")
async def analysis_create(body: AnalysisInput, user=Depends(protected_user)):
    live_consent(body)
    limiter.check("analyses:" + user["uid"], 30, 86400)
    return {"analysis_id": await create_analysis(user["uid"], body)}


@app.get("/api/analysis")
async def analyses(user=Depends(protected_user)):
    return await store().list(user["uid"], "analyses")


@app.get("/api/analysis/{id}")
async def analysis_get(id: str, user=Depends(protected_user)):
    await owned(user["uid"], "analyses", id)
    result = await report(user["uid"], id)
    result["stale"] = time.time() - result["created_at"] > 7 * 86400
    return result


@app.get("/api/analysis/{id}/stream")
async def analysis_stream(id: str, request: Request, user=Depends(protected_user)):
    await owned(user["uid"], "analyses", id)

    async def events():
        previous = ""
        for _ in range(600):
            if await request.is_disconnected():
                return
            record = await store().get(user["uid"], "analyses", id)
            if not record:
                return
            value = json.dumps({"status": record["status"], "progress": record["progress"]})
            if value != previous:
                yield "data: " + value + "\n\n"
                previous = value
            else:
                yield ": heartbeat\n\n"
            if record["status"] in {"done", "partial", "failed"}:
                return
            await asyncio.sleep(1)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


@app.post("/api/analysis/{id}/recompute")
async def recompute(id: str, body: RecomputeInput, user=Depends(protected_user)):
    async with locked(user["uid"], "analysis", safe_id(id)):
        original = await report(user["uid"], id)
        if not original:
            raise HTTPException(404, "Not found")
        if original["status"] not in {"done", "partial"}:
            raise HTTPException(409, "Wait for the analysis to finish")
        assumption_items = original["sections"]["assumptions"]
        if set(body.overrides) - {item["key"] for item in assumption_items}:
            raise HTTPException(422, "Unknown assumption key")
        for item in assumption_items:
            if item["key"] in body.overrides:
                item.update(
                    value=body.overrides[item["key"]].model_dump(),
                    provenance="founder",
                    fact_ids=[],
                    rationale="Founder override; computational scenario, not researched fact.",
                )
            try:
                Assumption.model_validate(item)
            except ValueError as error:
                raise HTTPException(
                    422, "An override is outside its domain: " + str(error).splitlines()[0]
                ) from None
        output = await asyncio.to_thread(
            compute,
            {item["key"]: item["value"] for item in assumption_items},
            original["inputs"]["horizon_months"],
            business_model=original["inputs"].get("business_model", "subscription"),
        )
        wedges = original["sections"]["wedges"]
        if body.weights:
            try:
                for wedge in wedges["items"]:
                    wedge["total"] = wedge_score(wedge["scores"], body.weights)
                wedges["weights"] = body.weights
            except ValueError as error:
                raise HTTPException(422, str(error)) from None
            wedges["items"].sort(key=lambda item: -item["total"])
            wedges["recommended"] = wedges["items"][0]["name"]
        for item in wedges["items"]:
            item["beachhead"] = beachhead(
                item,
                {a["key"]: a["value"] for a in assumption_items},
                original["inputs"].get("business_model", "subscription"),
            )
        if body.weights:
            wedges["stability"] = (
                "Scenario weights changed; stability recomputed with local weight perturbations."
            )
            wedges["stability_details"] = stability(wedges["items"], weights=body.weights)
        return {
            **output,
            "assumptions": assumption_items,
            "wedges": wedges,
            "is_recompute": True,
            "model_calls": 0,
            "saved": False,
            "note": "Scenario preview only. Save as a new version to preserve the original report.",
        }


@app.post("/api/analysis/{id}/version")
async def save_version(id: str, body: RecomputeInput, user=Depends(protected_user)):
    preview = await recompute(id, body, user)
    original = await report(user["uid"], id)
    new_id = uuid.uuid4().hex
    sections = original.pop("sections")
    sections.update(
        assumptions=preview["assumptions"],
        market=preview["market"],
        revenue={
            "scenarios": preview["scenarios"],
            "simulation": preview["simulation"],
            "flags": preview["flags"],
            "metadata": preview.get("metadata", {}),
        },
        unit_economics=preview["unit_economics"],
        sensitivity=preview["sensitivity"],
        simulation=preview["simulation"],
        wedges=preview["wedges"],
        funding={
            **sections["funding"],
            "need": preview["simulation"]["funding_need"],
            "breakeven_month": preview["scenarios"]["base"]["breakeven_month"],
            "runway_months": preview["scenarios"]["base"].get("runway_months"),
            "runway_status": preview["scenarios"]["base"].get("runway_status", "unknown"),
            "initial_cash": preview["scenarios"]["base"].get("initial_cash"),
        },
        claim_check=[],
    )
    original.update(
        id=new_id,
        parent_analysis_id=id,
        version=original["version"] + 1,
        created_at=time.time(),
        updated_at=time.time(),
        versions={
            "analysis_version": "1.0",
            "prompt_version": "1.0",
            "calls": [],
            "method": "Deterministic scenario version; no AI calls. Research and strategy inherited from parent.",
        },
    )
    original["inputs"]["overrides"] = {
        **original["inputs"].get("overrides", {}),
        **{key: value.model_dump() for key, value in body.overrides.items()},
    }
    original["confidence"] = confidence(
        preview["assumptions"], sections.get("sources", {}).get("items", []), preview["market"]
    )
    strategy = {"wedges": sections["wedges"]["items"], "risks": sections["risks"]}
    original["signals"] = signals(preview, strategy)
    await store().put(user["uid"], "analyses", new_id, original)
    for name, data in sections.items():
        await save_section(user["uid"], new_id, name, data)
    return {"analysis_id": new_id, "model_calls": 0}


class RerunInput(StrictModel):
    section: Literal["all", "competitors", "market", "strategy"] = "all"
    overrides: dict[str, Range] = Field(default_factory=dict)
    idea: str | None = Field(default=None, min_length=20, max_length=6000)


@app.post("/api/analysis/{id}/rerun")
async def rerun(id: str, body: RerunInput, user=Depends(protected_user)):
    prior = await owned(user["uid"], "analyses", id)
    limiter.check("reruns:" + user["uid"], 20, 86400)
    inputs = AnalysisInput.model_validate(
        {
            "idea": body.idea or prior["idea_text"],
            "title": prior["title"],
            **prior["inputs"],
            "overrides": {
                **prior["inputs"].get("overrides", {}),
                **{key: value.model_dump() for key, value in body.overrides.items()},
            },
        }
    )
    return {
        "analysis_id": await create_analysis(user["uid"], inputs, prior.get("pitch_id"), prior),
        "note": "A new report version is created. Linked calculations are refreshed together to preserve consistency.",
    }


class CompareInput(StrictModel):
    before: str
    after: str


@app.post("/api/analysis/compare")
async def compare(body: CompareInput, user=Depends(protected_user)):
    before, after = (
        await report(user["uid"], safe_id(body.before)),
        await report(user["uid"], safe_id(body.after)),
    )
    if not before or not after:
        raise HTTPException(404, "Not found")
    if any(before["inputs"][key] != after["inputs"][key] for key in ("currency", "horizon_months")):
        raise HTTPException(
            422,
            "Compare reports with the same currency and projection horizon; no exchange rates or time conversions are assumed.",
        )

    def digest(record):
        sections = record["sections"]
        return {
            "title": record["title"],
            "version": record["version"],
            "sam": sections.get("market", {}).get("base", {}).get("sam_bottom_up"),
            "revenue": sections.get("revenue", {}).get("scenarios", {}).get("base", {}).get("arr_end"),
            "funding": sections.get("funding", {}).get("need", {}).get("p50"),
            "wedge": sections.get("wedges", {}).get("recommended"),
            "risk_count": len(sections.get("risks", [])),
        }

    a, b = digest(before), digest(after)
    return {
        "before": a,
        "after": b,
        "deltas": {
            key: b[key] - a[key] if a[key] is not None and b[key] is not None else None
            for key in ("sam", "revenue", "funding", "risk_count")
        },
    }


@app.post("/api/analysis/{id}/claim-check")
async def check_claims(id: str, user=Depends(protected_user)):
    analysis = await owned(user["uid"], "analyses", id)
    if not analysis.get("pitch_id"):
        return {"claims": [], "note": "Attach a pitch session to check transcript claims."}
    pitch = await owned(user["uid"], "pitches", analysis["pitch_id"])
    return {"claims": await claim_check(user["uid"], id, pitch["messages"])}


@app.get("/api/analysis/{id}/export")
async def export(id: str, format: Literal["json", "csv"] = "json", user=Depends(protected_user)):
    data = await report(user["uid"], safe_id(id))
    if not data:
        raise HTTPException(404, "Not found")
    if format == "json":
        content, media = json.dumps(data, indent=2), "application/json"
    else:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["key", "unit", "low", "base", "high", "provenance", "rationale"])
        for item in data["sections"].get("assumptions", []):
            values = item["value"] or {}
            row = [
                item["key"],
                item["unit"],
                values.get("low"),
                values.get("base"),
                values.get("high"),
                item["provenance"],
                item["rationale"],
            ]
            writer.writerow(
                [
                    "'" + value
                    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r"))
                    else value
                    for value in row
                ]
            )
        content, media = buffer.getvalue(), "text/csv"
    return Response(
        content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="pitchgrill-{id}.{format}"'},
    )


@app.post("/api/analysis/{id}/archive")
async def archive(id: str, user=Depends(protected_user)):
    data = await report(user["uid"], safe_id(id))
    if not data:
        raise HTTPException(404, "Not found")
    result = await archive_export(user["uid"], id, json.dumps(data))
    if result is None:
        raise HTTPException(409, "Configure Cloud Storage in Setup to archive reports")
    return result


@app.post("/api/analysis/{id}/share")
async def share(id: str, body: ShareInput, user=Depends(protected_user)):
    data = await report(user["uid"], safe_id(id))
    if not data or data["status"] not in {"done", "partial"}:
        raise HTTPException(409, "Wait for the report to finish")
    if any(section not in data["sections"] for section in body.sections):
        raise HTTPException(422, "Unknown report section")
    token = secrets.token_urlsafe(32)
    key = hashlib.sha256(token.encode()).hexdigest()
    record = {
        "id": key,
        "uid": user["uid"],
        "analysis_id": id,
        "sections": body.sections,
        "expires_at": time.time() + body.expires_hours * 3600,
        "created_at": time.time(),
        "revoked": False,
    }
    await store().put("system", "shares", key, record)
    return {
        "token": token,
        "url": settings().public_app_url + "/r/" + token,
        "expires_at": record["expires_at"],
        "sections": body.sections,
    }


@app.get("/api/analysis/{id}/shares")
async def shares(id: str, user=Depends(protected_user)):
    await owned(user["uid"], "analyses", id)
    rows = await store().list("system", "shares", 1000)
    return [
        {key: value for key, value in row.items() if key != "uid"}
        for row in rows
        if row["uid"] == user["uid"] and row["analysis_id"] == id
    ]


@app.delete("/api/analysis/share/{key}")
async def revoke(key: str, user=Depends(protected_user)):
    safe_id(key)
    row = await store().get("system", "shares", key)
    if not row or row["uid"] != user["uid"]:
        raise HTTPException(404, "Not found")
    row["revoked"] = True
    await store().put("system", "shares", key, row)
    return {"revoked": True}


@app.get("/api/public/analysis/{token}")
async def public_report(token: str):
    safe_id(token)
    row = await store().get("system", "shares", hashlib.sha256(token.encode()).hexdigest())
    if not row or row["revoked"] or row["expires_at"] < time.time():
        raise HTTPException(404, "Share link expired, revoked or unavailable")
    data = await report(row["uid"], row["analysis_id"])
    if not data:
        raise HTTPException(404, "Report deleted")
    return {
        "id": data["id"],
        "title": data["title"],
        "status": data["status"],
        "version": data["version"],
        "created_at": data["created_at"],
        "is_synthetic": data["is_synthetic"],
        "confidence": data.get("confidence"),
        "inputs": {key: data["inputs"][key] for key in ("currency", "locale", "horizon_months", "geography")},
        "sections": {key: value for key, value in data["sections"].items() if key in row["sections"]},
        "public": True,
    }


@app.delete("/api/analysis/{id}")
async def analysis_delete(id: str, user=Depends(protected_user)):
    record = await owned(user["uid"], "analyses", id)
    if record["status"] in {"queued", "running"}:
        raise HTTPException(409, "Wait for the job to stop before deleting it")
    try:
        await delete_cloud_data(user["uid"], analysis_id=id)
    except Exception:
        raise HTTPException(
            503, "Private cloud archive deletion is unavailable. Retry before removing the local report."
        ) from None
    await store().delete_kind(user["uid"], "sections_" + id)
    await store().delete(user["uid"], "analyses", id)
    return {"deleted": True}


@app.get("/api/analytics/overview")
async def analytics(user=Depends(protected_user)):
    all_pitches = await store().list(user["uid"], "pitches")
    completed = sorted([p for p in all_pitches if p.get("report")], key=lambda p: p["created_at"])
    rows = [
        {
            "id": p["id"],
            "title": p["title"],
            "score": p["report"]["overall_score"],
            "scorecard": p["report"]["scorecard"],
            "attempt": p["attempt_number"],
            "difficulty": p["difficulty"],
            "is_synthetic": p["is_synthetic"],
            "created_at": p["created_at"],
        }
        for p in completed
    ]
    metrics = [m["metrics"] for p in completed for m in p["messages"] if m.get("metrics")]
    categories = {}
    for metric in metrics:
        category = metric["question_category"]
        categories.setdefault(category, []).append(metric)
    heatmap = [
        {
            "category": key,
            "n": len(values),
            **{
                metric: round(sum(v[metric] for v in values) / len(values))
                for metric in ("directness", "specificity", "evidence_strength")
            },
        }
        for key, values in categories.items()
    ]
    cohorts = await personal_benchmarks(user["uid"])
    available = [cohort for cohort in cohorts if cohort["available"]]
    groups = {}
    for pitch in completed:
        root, seen = pitch, set()
        while root.get("parent_pitch_id") and root["id"] not in seen:
            seen.add(root["id"])
            parent = next((p for p in completed if p["id"] == root["parent_pitch_id"]), None)
            if not parent:
                break
            root = parent
        groups.setdefault(root["id"], []).append(
            {
                "id": pitch["id"],
                "attempt": pitch["attempt_number"],
                "score": pitch["report"]["overall_score"],
                "practice_category": pitch.get("practice_category"),
            }
        )
    return {
        "sessions": rows,
        "session_count": len(all_pitches),
        "completed_count": len(completed),
        "average_score": round(sum(p["score"] for p in rows) / len(rows)) if rows else None,
        "latest_score": rows[-1]["score"] if rows else None,
        "heatmap": heatmap,
        "readiness": readiness(completed[-1]) if completed else None,
        "interest_trajectories": [
            {"pitch_id": p["id"], "title": p["title"], "points": p.get("interest_history", [])}
            for p in completed[-10:]
        ],
        "retry_groups": [{"root_pitch_id": key, "attempts": value} for key, value in groups.items()],
        "cohorts": cohorts,
        "benchmark": {
            "available": bool(available),
            "reason": "Consented cohort comparisons are available below."
            if available
            else "Synthetic sessions are excluded. No sufficiently sized consented cohort is available.",
            "real_session_count": sum(not p["is_synthetic"] for p in completed),
        },
        "interpretation": "Scores are practice judgments. Trends measure your own sessions; they are not calibrated investment readiness.",
    }


@app.post("/api/demo/seed")
async def seed(user=Depends(protected_user)):
    if settings().app_mode != "demo":
        raise HTTPException(403, "Synthetic examples are available only in demo mode")
    existing = await store().list(user["uid"], "pitches")
    if any(p.get("seed_example") for p in existing):
        return {"seeded": False, "note": "Example sessions already exist in your workspace"}
    cases = [
        (
            "Everything AI · weak example",
            "We are building an AI assistant for everyone. It is a huge market and we have no competitors. Everyone needs this.",
            [
                "Let's move on. Numbers don't matter.",
                "We will figure it out later.",
                "Everyone will want this.",
            ],
        ),
        (
            "LocalLoop · developing example",
            "LocalLoop helps independent bakeries sell surplus stock. We interviewed 12 owners and are testing a prototype. Our price hypothesis is $50 per month.",
            [
                "We interviewed bakery owners about recurring surplus and found that they use group chats today.",
                "Our estimated price is $50 monthly. We have not measured acquisition cost yet, so we will run a paid pilot.",
                "Our first reachable segment is 100 local bakeries. We plan to interview customers before expanding.",
            ],
        ),
        (
            "Shiftwise · strong example",
            "Shiftwise helps independent clinics fill cancelled appointments. In a 6-week paid pilot, 8 clinics recovered 120 appointments and 6 asked to continue. They paid $80 monthly. We have not measured long-term churn.",
            [
                "Our paying customers are clinics with 3 to 10 practitioners. The 8 pilot clinics paid $80 monthly and 6 requested another month. We measured recovered appointments, not just satisfaction.",
                "Monthly delivery cost was $12 per clinic. We spent $150 per paid clinic on the small acquisition experiment. We do not yet know long-term churn and will measure retention cohorts.",
                "Our first segment contains an estimated 200 clinics in reachable local networks. This is a founder estimate to validate through a directory and interviews; it is not a sourced market size.",
            ],
        ),
    ]
    for title, idea, answers in cases:
        session = await start(StartInput(title=title, idea=idea, difficulty="vc"), user)
        for text in answers:
            session = await answer(AnswerInput(pitch_id=session["id"], answer=text), user)
        session = await finish(PitchId(pitch_id=session["id"]), user)
        session["seed_example"] = True
        await store().put(user["uid"], "pitches", session["id"], session)
    return {"seeded": True, "count": 3, "is_synthetic": True}


@app.get("/api/user/export")
async def user_export(user=Depends(protected_user)):
    records = await store().list(user["uid"], "analyses")
    return {
        "pitches": await store().list(user["uid"], "pitches"),
        "analyses": [await report(user["uid"], record["id"]) for record in records],
    }


@app.delete("/api/user")
async def user_delete(user=Depends(protected_user)):
    from backend.cohorts import leave

    try:
        await delete_cloud_data(user["uid"], pitches=await store().list(user["uid"], "pitches", 10000))
    except Exception:
        raise HTTPException(
            503,
            "Cloud data deletion is unavailable. Your workspace remains accessible; retry when cloud services recover.",
        ) from None
    for item in await store().list(user["uid"], "memberships"):
        await leave(item["id"], user)
    await store().delete_user(user["uid"])
    return {"deleted": True}


@app.post("/api/internal/job")
async def internal_job(request: Request):
    config = settings()
    if config.app_mode != "live" or not config.cloud_tasks_service_account:
        raise HTTPException(403, "Cloud Tasks is not enabled")
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token

    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    try:
        claims = await asyncio.to_thread(
            id_token.verify_oauth2_token, token, GoogleRequest(), config.cloud_tasks_target.rstrip("/")
        )
        if claims.get("email") != config.cloud_tasks_service_account or not claims.get("email_verified"):
            raise ValueError("Unexpected task identity")
    except Exception:
        raise HTTPException(403, "Invalid task identity") from None
    body = await request.json()
    job = await store().claim(safe_id(body.get("job_id", "")))
    if job:
        from backend.worker import execute_job

        await execute_job(job)
    elif await store().job_state(safe_id(body.get("job_id", ""))) in {"queued", "running"}:
        raise HTTPException(
            503, "Job lease is active; retry dispatch after the lease expires", headers={"Retry-After": "300"}
        )
    return {"accepted": True}


class SpeechInput(StrictModel):
    text: str = Field(min_length=1, max_length=2000)
    investor: Literal["vc", "operator", "customer", "impact"]


@app.post("/api/voice/speak")
async def speak(body: SpeechInput, user=Depends(protected_user)):
    if not settings().google_speech_enabled or user["mode"] != "live":
        raise HTTPException(409, "Cloud voices are disabled. Use browser voices or typing.")
    limiter.check("speech:" + user["uid"], 15)
    return Response(await text_to_speech(body.text, body.investor), media_type="audio/mpeg")


@app.post("/api/voice/transcribe")
async def transcribe(request: Request, user=Depends(protected_user)):
    if not settings().google_speech_enabled or user["mode"] != "live":
        raise HTTPException(409, "Cloud transcription is disabled. Use browser speech or typing.")
    if request.headers.get("content-type", "").split(";")[0] != "audio/webm":
        raise HTTPException(415, "Send a short WebM/Opus recording")
    audio = await request.body()
    if not audio or len(audio) > 1_500_000:
        raise HTTPException(413, "Recording exceeds the audio budget")
    limiter.check("transcribe:" + user["uid"], 10)
    return {"text": await speech_to_text(audio)}
