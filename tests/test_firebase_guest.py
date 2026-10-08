import json

import httpx
from fastapi.testclient import TestClient
from firebase_admin import auth

from backend import firebase_guest
from backend.config import settings
from backend.main import app
from backend.security import limiter


def test_assisted_guest_keeps_verified_identity_and_private_refresh_cookie(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-web-key")
    settings.cache_clear()
    limiter.events.clear()
    calls = []

    async def handler(request):
        calls.append(request)
        if "securetoken" in request.url.host:
            return httpx.Response(
                200, json={"id_token": "refreshed-token", "refresh_token": "rotated-refresh"}
            )
        return httpx.Response(200, json={"idToken": "initial-token", "refreshToken": "private-refresh"})

    actual = httpx.AsyncClient
    monkeypatch.setattr(
        firebase_guest.httpx, "AsyncClient", lambda **kwargs: actual(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(firebase_guest, "initialize_firebase", lambda: None)
    checked = []

    def verify(token, check_revoked):
        checked.append((token, check_revoked))
        return {"uid": "verified-user", "firebase": {"sign_in_provider": "anonymous"}}

    monkeypatch.setattr(auth, "verify_id_token", verify)
    with TestClient(app) as client:
        assert (
            client.post("/api/auth/firebase-guest", headers={"Origin": "https://evil.example"}).status_code
            == 403
        )
        assert calls == []
        first = client.post("/api/auth/firebase-guest", headers={"Origin": "http://localhost:3000"})
        assert first.status_code == 200
        assert first.json()["auth_provider"] == "firebase"
        assert "refresh" not in json.dumps(first.json())
        cookie = first.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=strict" in cookie
        assert "private-refresh" not in cookie
        refreshed = client.post("/api/auth/firebase-guest", headers={"Origin": "http://localhost:3000"})
        assert refreshed.json()["token"] == "refreshed-token"
        assert len(calls) == 2 and "securetoken" in calls[1].url.host
        assert checked == [("initial-token", True), ("refreshed-token", True)]
        monkeypatch.setattr(
            auth,
            "verify_id_token",
            lambda *args, **kwargs: {"uid": "different-user", "firebase": {"sign_in_provider": "anonymous"}},
        )
        assert (
            client.post("/api/auth/firebase-guest", headers={"Origin": "http://localhost:3000"}).status_code
            == 401
        )
        assert (
            client.post(
                "/api/auth/firebase-guest/logout", headers={"Origin": "http://localhost:3000"}
            ).status_code
            == 200
        )
        assert firebase_guest.COOKIE not in client.cookies


def test_corrupt_guest_cookie_never_creates_a_replacement_identity(monkeypatch):
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-web-key")
    settings.cache_clear()
    limiter.events.clear()
    with TestClient(app) as client:
        client.cookies.set(firebase_guest.COOKIE, "tampered")
        response = client.post("/api/auth/firebase-guest", headers={"Origin": "http://localhost:3000"})
        assert response.status_code == 401
