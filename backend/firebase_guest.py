import base64
import hashlib
import json
import os

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.security import demo_secret, initialize_firebase, limiter

router = APIRouter(prefix="/api/auth/firebase-guest", tags=["authentication"])
COOKIE = "pitchgrill-firebase-guest"
TTL = 7 * 86400


def cipher():
    secret = os.getenv("AUTH_COOKIE_SECRET") or demo_secret()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("firebase-guest:" + secret).encode()).digest()))


def trusted_origin(request):
    if settings().app_mode != "live":
        raise HTTPException(404, "Available only with live Firebase authentication")
    allowed = {origin.strip() for origin in settings().allowed_origins.split(",")}
    if request.headers.get("origin") not in allowed:
        raise HTTPException(403, "Untrusted origin")


@router.post("")
async def guest(request: Request):
    trusted_origin(request)
    limiter.check("firebase-guest:" + request.client.host, 20)
    key = os.getenv("NEXT_PUBLIC_FIREBASE_API_KEY")
    if not key:
        raise HTTPException(503, "Firebase web authentication is not configured")
    session = None
    encrypted = request.cookies.get(COOKIE)
    if encrypted:
        try:
            session = json.loads(cipher().decrypt(encrypted.encode(), ttl=TTL))
        except (InvalidToken, ValueError, KeyError):
            raise HTTPException(401, "Guest session expired; sign out and start a new session") from None
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            if session:
                response = await client.post(
                    "https://securetoken.googleapis.com/v1/token",
                    params={"key": key},
                    data={"grant_type": "refresh_token", "refresh_token": session["refresh_token"]},
                )
                response.raise_for_status()
                data = response.json()
                token, refresh = data["id_token"], data["refresh_token"]
            else:
                limiter.check("firebase-guest-create:" + request.client.host, 10, 3600)
                response = await client.post(
                    "https://identitytoolkit.googleapis.com/v1/accounts:signUp",
                    params={"key": key},
                    json={"returnSecureToken": True},
                )
                response.raise_for_status()
                data = response.json()
                token, refresh = data["idToken"], data["refreshToken"]
        import asyncio

        from firebase_admin import auth

        initialize_firebase()
        identity = await asyncio.to_thread(auth.verify_id_token, token, check_revoked=True)
        if identity.get("firebase", {}).get("sign_in_provider") != "anonymous" or (
            session and identity["uid"] != session["uid"]
        ):
            raise HTTPException(401, "Invalid guest identity")
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(
            503, "Firebase guest sign-in unavailable; check connectivity and authentication setup"
        ) from None
    result = JSONResponse({"token": token, "expires_in": 3500, "mode": "live", "auth_provider": "firebase"})
    result.set_cookie(
        COOKIE,
        cipher().encrypt(json.dumps({"refresh_token": refresh, "uid": identity["uid"]}).encode()).decode(),
        max_age=TTL,
        httponly=True,
        secure=settings().public_app_url.startswith("https://"),
        samesite="strict",
        path="/api/auth/firebase-guest",
    )
    return result


@router.post("/logout")
async def logout(request: Request):
    trusted_origin(request)
    result = JSONResponse({"signed_out": True})
    result.delete_cookie(
        COOKIE,
        path="/api/auth/firebase-guest",
        httponly=True,
        secure=settings().public_app_url.startswith("https://"),
        samesite="strict",
    )
    return result
