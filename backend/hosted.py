import os
from urllib.parse import urlsplit

import uvicorn

from backend.config import settings


def validate_hosted():
    config = settings()
    if not os.getenv("RENDER"):
        return
    if config.app_mode != "live" or config.storage_backend != "firestore":
        raise ValueError("Render requires live mode and Firestore; local files are ephemeral")
    if not config.inline_worker:
        raise ValueError("Render free hosting requires INLINE_WORKER=true")
    if len(os.getenv("AUTH_COOKIE_SECRET", "")) < 32:
        raise ValueError("Set a persistent AUTH_COOKIE_SECRET of at least 32 characters")
    for value in [config.public_app_url, *config.allowed_origins.split(",")]:
        url = urlsplit(value.strip())
        if (
            url.scheme != "https"
            or not url.hostname
            or url.username
            or url.password
            or url.path not in {"", "/"}
            or url.query
            or url.fragment
        ):
            raise ValueError("Hosted app URL and allowed origins must be explicit HTTPS origins")
    if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        raise ValueError("Configure the Render Google credential secret file")


def main():
    validate_hosted()
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        workers=1,
        proxy_headers=False,
        timeout_graceful_shutdown=15,
    )


if __name__ == "__main__":
    main()
