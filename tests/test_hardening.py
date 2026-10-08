import asyncio

import pytest
from fastapi.testclient import TestClient

from backend.analysis.research import assign_sources, safe_url
from backend.main import app
from backend.middleware import BodyLimitMiddleware
from backend.store import store


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "javascript:alert(1)",
        "https://localhost/x",
        "https://127.0.0.1/x",
        "https://169.254.169.254",
        "https://x:secret@example.com",
        "https://example.internal",
        "https://[::1]",
    ],
)
def test_sources_reject_unsafe_urls(url):
    assert safe_url(url) is None


def test_source_ids_are_assigned_by_code_and_deduplicated():
    result = {
        "items": [
            {
                "id": "attacker",
                "url": "https://example.com/report",
                "title": "Report",
                "snippet": "A short fact",
                "published": None,
            }
        ],
        "provider": "mock",
        "search_suggestions": "",
    }
    sources, excerpts, _ = assign_sources([("market", result), ("competitors", result)])
    assert len(sources) == 1
    assert sources[0]["id"] == "s1"
    assert excerpts["competitors"][0]["source_id"] == "s1"


def test_chunked_request_limit_without_content_length():
    async def check():
        sent, called = [], []
        events = iter(
            [
                {"type": "http.request", "body": b"a" * 8, "more_body": True},
                {"type": "http.request", "body": b"b" * 8, "more_body": False},
            ]
        )

        async def receive():
            return next(events)

        async def send(message):
            sent.append(message)

        async def downstream(scope, receive, send):
            called.append(True)

        await BodyLimitMiddleware(downstream, limit=10)({"type": "http", "method": "POST"}, receive, send)
        assert sent[0]["status"] == 413
        assert not called

    asyncio.run(check())


def test_cors_rejects_unapproved_origin_and_large_upload():
    with TestClient(app) as client:
        response = client.options(
            "/api/auth/guest",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        assert "access-control-allow-origin" not in response.headers
        assert client.post("/api/auth/guest", content=b"x" * 2_000_001).status_code == 413


def test_deleted_workspace_cannot_be_recreated_by_inflight_job():
    async def check():
        await store().put("alice", "analyses", "one", {"status": "running"})
        await store().delete_user("alice")
        with pytest.raises(ValueError, match="deleted"):
            await store().put("alice", "sections_one", "market", {"late": True})
        assert await store().list("alice", "analyses") == []

    asyncio.run(check())


def test_exhausted_job_marks_report_failed():
    async def check():
        db = store()
        await db.put("alice", "analyses", "one", {"status": "running"})
        job = await db.enqueue("alice", "one")
        with db.backend.db() as connection:
            connection.execute("UPDATE jobs SET state='running',lease=0,attempts=3 WHERE id=?", (job,))
        assert await db.claim() is None
        assert (await db.get("alice", "analyses", "one"))["status"] == "failed"

    asyncio.run(check())
