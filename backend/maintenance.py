import asyncio

from backend.config import settings
from backend.google_services import load_secrets
from backend.store import store


async def main():
    await load_secrets()
    await store().purge(settings().retention_days)


if __name__ == "__main__":
    asyncio.run(main())
