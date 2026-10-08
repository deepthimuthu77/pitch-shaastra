import asyncio
import re
import secrets
import time
from collections import defaultdict, deque

import firebase_admin
import jwt
from fastapi import Depends, Header, HTTPException, Request
from firebase_admin import auth

from backend.config import settings


def initialize_firebase():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": settings().firebase_project_id})


def demo_secret():
    path = settings().data_dir / "demo-secret"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x") as stream:
            stream.write(secrets.token_urlsafe(48))
        path.chmod(0o600)
    except FileExistsError:
        pass
    return path.read_text().strip()


def demo_token(uid=None):
    now = int(time.time())
    uid = uid or "guest_" + secrets.token_hex(16)
    token = jwt.encode(
        {"sub": uid, "iat": now, "exp": now + 86400 * 7, "iss": "pitchgrill-demo", "aud": "pitchgrill"},
        demo_secret(),
        algorithm="HS256",
    )
    return {"token": token, "uid": uid, "expires_at": now + 86400 * 7, "mode": "demo"}


async def require_auth(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer ") or len(authorization) > 8192:
        raise HTTPException(401, "Sign in or start a guest session")
    token = authorization[7:]
    try:
        if settings().app_mode == "demo":
            payload = jwt.decode(
                token,
                demo_secret(),
                algorithms=["HS256"],
                issuer="pitchgrill-demo",
                audience="pitchgrill",
                options={"require": ["sub", "iat", "exp", "iss", "aud"]},
            )
            return {"uid": payload["sub"], "is_guest": True, "mode": "demo"}
        initialize_firebase()
        payload = await asyncio.to_thread(auth.verify_id_token, token, check_revoked=True)
        return {
            "uid": payload["uid"],
            "is_guest": payload.get("firebase", {}).get("sign_in_provider") == "anonymous",
            "mode": "live",
        }
    except Exception:
        raise HTTPException(401, "Session expired or invalid; sign in again") from None


class RateLimiter:
    def __init__(self):
        self.events = defaultdict(deque)

    def check(self, key, limit=40, seconds=60):
        now = time.monotonic()
        events = self.events[key]
        while events and events[0] < now - seconds:
            events.popleft()
        if len(events) >= limit:
            raise HTTPException(429, "Too many requests; please wait", headers={"Retry-After": str(seconds)})
        events.append(now)
        if len(self.events) > 10_000:
            self.events = defaultdict(
                deque, {k: v for k, v in self.events.items() if v and v[-1] > now - seconds}
            )


limiter = RateLimiter()


async def protected_user(request: Request, user=Depends(require_auth)):
    limiter.check(user["uid"], 60)
    from backend.store import store

    if await store().is_deleted(user["uid"]):
        raise HTTPException(401, "This workspace was deleted; start a new session")
    return user


def redact(text: str):
    text = re.sub(r"\bAIza[\w-]{30,}\b|\b(?:sk-|gsk_)[\w-]{20,}\b", "[secret redacted]", text)
    return re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email redacted]", text)


def safe_id(value: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise HTTPException(400, "Invalid identifier")
    return value
