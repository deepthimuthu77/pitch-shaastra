import asyncio
import signal
import time

from backend.analysis.service import run_analysis
from backend.config import settings
from backend.google_services import load_secrets, log_event
from backend.store import store

_wake = None


def wake_worker():
    if _wake is not None:
        _wake.set()


async def execute_job(job):
    await run_analysis(job["uid"], job["analysis_id"])
    result = await store().get(job["uid"], "analyses", job["analysis_id"])
    await store().finish_job(job["id"], "failed" if result and result["status"] == "failed" else "done")


async def run_worker(stopping):
    global _wake
    _wake = asyncio.Event()
    last_purge = last_heartbeat = 0
    try:
        while not stopping.is_set():
            _wake.clear()
            try:
                if time.time() - last_heartbeat >= 30:
                    await store().heartbeat()
                    last_heartbeat = time.time()
                if time.time() - last_purge > 3600:
                    try:
                        await store().purge(settings().retention_days)
                        await store().put(
                            "system", "health", "retention", {"ready": True, "time": time.time()}
                        )
                    except Exception as error:
                        await store().put(
                            "system",
                            "health",
                            "retention",
                            {"ready": False, "error_type": type(error).__name__, "time": time.time()},
                        )
                        log_event("retention_unavailable", {"error_type": type(error).__name__})
                    last_purge = time.time()
                job = await store().claim()
                if job:
                    await execute_job(job)
                    continue
            except Exception as error:
                log_event("worker_error", {"error_type": type(error).__name__})
            try:
                await asyncio.wait_for(_wake.wait(), timeout=settings().worker_poll_seconds)
            except TimeoutError:
                pass
    finally:
        _wake = None


async def main():
    await load_secrets()
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()

    def stop():
        stopping.set()
        wake_worker()

    for event in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(event, stop)
        except NotImplementedError:
            pass
    await run_worker(stopping)


if __name__ == "__main__":
    asyncio.run(main())
