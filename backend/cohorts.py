import hashlib
import secrets
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from backend.llm.schemas import StrictModel
from backend.security import protected_user, safe_id
from backend.store import store

router = APIRouter(prefix="/api/org", tags=["cohorts"])


@asynccontextmanager
async def org_lock(id):
    key = "cohort_" + hashlib.sha256(id.encode()).hexdigest()
    token = await store().acquire(key)
    if not token:
        raise HTTPException(409, "Another cohort update is processing. Retry in a moment.")
    try:
        yield
    finally:
        await store().release(key, token)


class CreateOrg(StrictModel):
    name: str = Field(min_length=3, max_length=100)


class JoinOrg(StrictModel):
    token: str = Field(min_length=20, max_length=100)
    alias: str = Field(min_length=1, max_length=60)
    share_metrics: bool = False


class Consent(StrictModel):
    share_metrics: bool


async def membership(id, user):
    org = await store().get("system", "orgs", safe_id(id))
    if not org or not any(member["uid"] == user["uid"] for member in org["members"]):
        raise HTTPException(404, "Cohort not found")
    return org


@router.post("")
async def create(body: CreateOrg, user=Depends(protected_user)):
    if len(await store().list(user["uid"], "memberships")) >= 10:
        raise HTTPException(409, "Cohort limit reached")
    id = uuid.uuid4().hex
    org = {
        "id": id,
        "name": body.name,
        "owner": user["uid"],
        "members": [{"uid": user["uid"], "alias": "Host", "share_metrics": False}],
        "created_at": time.time(),
    }
    await store().put("system", "orgs", id, org)
    await store().put(user["uid"], "memberships", id, {"id": id, "name": body.name, "role": "owner"})
    return {"id": id, "name": body.name}


@router.get("")
async def list_orgs(user=Depends(protected_user)):
    return await store().list(user["uid"], "memberships")


@router.post("/{id}/invite")
async def invite(id: str, user=Depends(protected_user)):
    org = await membership(id, user)
    if org["owner"] != user["uid"]:
        raise HTTPException(403, "Only the cohort host may create invitations")
    token = secrets.token_urlsafe(32)
    key = hashlib.sha256(token.encode()).hexdigest()
    await store().put("system", "invites", key, {"id": key, "org": id, "expires_at": time.time() + 7 * 86400})
    return {
        "token": token,
        "expires_days": 7,
        "note": "Send this invitation yourself. Joining never shares ideas or transcripts.",
    }


@router.post("/join")
async def join(body: JoinOrg, user=Depends(protected_user)):
    invite = await store().get("system", "invites", hashlib.sha256(body.token.encode()).hexdigest())
    if not invite or invite["expires_at"] < time.time():
        raise HTTPException(404, "Invitation unavailable or expired")
    async with org_lock(invite["org"]):
        org = await store().get("system", "orgs", invite["org"])
        if not org or len(org["members"]) >= 200:
            raise HTTPException(409, "Cohort unavailable or full")
        existing = next((member for member in org["members"] if member["uid"] == user["uid"]), None)
        if existing:
            existing.update(alias=body.alias, share_metrics=body.share_metrics)
        else:
            org["members"].append(
                {"uid": user["uid"], "alias": body.alias, "share_metrics": body.share_metrics}
            )
        await store().put("system", "orgs", org["id"], org)
        await store().put(
            user["uid"],
            "memberships",
            org["id"],
            {
                "id": org["id"],
                "name": org["name"],
                "role": "owner" if org["owner"] == user["uid"] else "member",
            },
        )
        return {"joined": True, "id": org["id"]}


@router.post("/{id}/consent")
async def consent(id: str, body: Consent, user=Depends(protected_user)):
    async with org_lock(id):
        org = await membership(id, user)
        for member in org["members"]:
            if member["uid"] == user["uid"]:
                member["share_metrics"] = body.share_metrics
        await store().put("system", "orgs", org["id"], org)
        return {"share_metrics": body.share_metrics}


@router.get("/{id}")
async def overview(id: str, user=Depends(protected_user)):
    org = await membership(id, user)
    my_consent = next(member["share_metrics"] for member in org["members"] if member["uid"] == user["uid"])
    records, participants = [], 0
    for member in org["members"]:
        if member["share_metrics"]:
            rows = [
                p
                for p in await store().list(member["uid"], "pitches")
                if not p["is_synthetic"] and p.get("report")
            ]
            if rows:
                participants += 1
                records.extend(rows)
    ready = participants >= 5 and len(records) >= 10
    result = {
        "id": org["id"],
        "name": org["name"],
        "role": "owner" if org["owner"] == user["uid"] else "member",
        "member_count": len(org["members"]),
        "my_consent": my_consent,
        "benchmark_available": ready,
        "privacy_rule": "Aggregate metrics require at least 5 consenting real participants and 10 real sessions. Synthetic sessions, ideas and transcripts are excluded.",
    }
    if ready:
        scores = [p["report"]["overall_score"] for p in records]
        result.update(
            real_sessions=len(scores),
            average_score=round(sum(scores) / len(scores)),
            dimensions={
                key: round(sum(p["report"]["scorecard"][key] for p in records) / len(records))
                for key in records[0]["report"]["scorecard"]
            },
        )
    return result


@router.delete("/{id}/membership")
async def leave(id: str, user=Depends(protected_user)):
    async with org_lock(id):
        org = await membership(id, user)
        if org["owner"] == user["uid"]:
            for member in org["members"]:
                await store().delete(member["uid"], "memberships", id)
            await store().delete("system", "orgs", id)
        else:
            org["members"] = [member for member in org["members"] if member["uid"] != user["uid"]]
            await store().put("system", "orgs", id, org)
            await store().delete(user["uid"], "memberships", id)
        return {"removed": True}
