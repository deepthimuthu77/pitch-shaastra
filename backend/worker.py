import asyncio
import signal
import time

from backend.analysis.service import run_analysis
from backend.config import settings
from backend.google_services import load_secrets, log_event
from backend.store import store


async def execute_job(job):
    await run_analysis(job["uid"], job["analysis_id"])
    result = await store().get(job["uid"], "analyses", job["analysis_id"])
    await store().finish_job(job["id"], "failed" if result and result["status"] == "failed" else "done")


async def main():
    await load_secrets()
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for event in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(event, stopping.set)
        except NotImplementedError:
            pass
    last_purge = 0
    while not stopping.is_set():
        await store().heartbeat()
        if time.time() - last_purge > 3600:
            await store().purge(settings().retention_days)
            last_purge = time.time()
        job = await store().claim()
        if job:
            try:
                await execute_job(job)
            except Exception as error:
                log_event("worker_error", {"error_type": type(error).__name__})
            continue
        try:
            await asyncio.wait_for(stopping.wait(), timeout=1)
        except TimeoutError:
            pass


if __name__ == "__main__":
    asyncio.run(main())
