import asyncio

import pytest

from backend import worker
from backend.config import settings
from backend.hosted import validate_hosted


def test_render_rejects_ephemeral_storage_and_unstable_sessions(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    with pytest.raises(ValueError, match="Firestore"):
        validate_hosted()
    monkeypatch.setenv("APP_MODE", "live")
    monkeypatch.setenv("STORAGE_BACKEND", "firestore")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("INLINE_WORKER", "true")
    settings.cache_clear()
    with pytest.raises(ValueError, match="AUTH_COOKIE_SECRET"):
        validate_hosted()
    monkeypatch.setenv("AUTH_COOKIE_SECRET", "s" * 48)
    monkeypatch.setenv("PUBLIC_APP_URL", "https://pitchgrill.vercel.app")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://pitchgrill.vercel.app")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/etc/secrets/google.json")
    settings.cache_clear()
    validate_hosted()
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://pitchgrill.vercel.app")
    settings.cache_clear()
    with pytest.raises(ValueError, match="HTTPS"):
        validate_hosted()


def test_inline_worker_wakes_on_enqueue_and_survives_store_failure(monkeypatch):
    async def scenario():
        stopping = asyncio.Event()
        idle = asyncio.Event()
        completed = asyncio.Event()
        queued = []
        counts = {"heartbeat": 0, "claim": 0}

        class Store:
            async def heartbeat(self):
                counts["heartbeat"] += 1

            async def purge(self, days):
                pass

            async def put(self, *args):
                pass

            async def claim(self):
                counts["claim"] += 1
                idle.set()
                if counts["claim"] == 1:
                    raise ConnectionError("Temporary store interruption")
                return queued.pop() if queued else None

        async def execute(job):
            assert job["id"] == "queued-job"
            stopping.set()
            completed.set()

        monkeypatch.setattr(worker, "store", Store)
        monkeypatch.setattr(worker, "execute_job", execute)
        monkeypatch.setenv("WORKER_POLL_SECONDS", "300")
        settings.cache_clear()
        task = asyncio.create_task(worker.run_worker(stopping))
        try:
            await asyncio.wait_for(idle.wait(), 2)
            queued.append({"id": "queued-job"})
            worker.wake_worker()
            await asyncio.wait_for(completed.wait(), 2)
            await task
            assert counts == {"heartbeat": 1, "claim": 2}
            assert worker._wake is None
        finally:
            task.cancel()

    asyncio.run(scenario())
