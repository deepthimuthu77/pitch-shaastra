import asyncio
import base64
import hashlib
import json
import logging
import os

import httpx

from backend.config import settings

logger = logging.getLogger("pitchgrill")


async def load_secrets():
    config = settings()
    if not config.google_secret_prefix or config.app_mode == "demo":
        return
    from google.cloud import secretmanager

    client = secretmanager.SecretManagerServiceClient()
    for key in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "TAVILY_API_KEY", "SERPER_API_KEY"):
        if os.getenv(key):
            continue
        try:
            name = f"projects/{config.google_cloud_project}/secrets/{config.google_secret_prefix}-{key.lower().replace('_', '-')}/versions/latest"
            result = await asyncio.to_thread(client.access_secret_version, request={"name": name})
            os.environ[key] = result.payload.data.decode()
        except Exception:
            logger.warning("Optional secret unavailable: %s", key)


def log_event(event, fields):
    record = {"event": event, **fields}
    logger.info(json.dumps(record))
    if settings().cloud_logging and settings().app_mode == "live":
        try:
            from google.cloud import logging as cloud_logging

            cloud_logging.Client(project=settings().google_cloud_project).logger("pitchgrill").log_struct(
                record
            )
        except Exception:
            logger.warning("Cloud Logging unavailable")


async def queue_cloud_task(job_id):
    config = settings()
    if not config.cloud_tasks_queue or config.app_mode != "live":
        return False
    if config.storage_backend != "firestore":
        raise ValueError("Cloud Tasks requires shared Firestore storage")
    from google.cloud import tasks_v2

    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(
        config.google_cloud_project, config.cloud_tasks_location, config.cloud_tasks_queue
    )
    task = {
        "name": f"{parent}/tasks/{job_id}",
        "dispatch_deadline": {"seconds": 900},
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": config.cloud_tasks_target.rstrip("/") + "/api/internal/job",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"job_id": job_id}).encode(),
            "oidc_token": {
                "service_account_email": config.cloud_tasks_service_account,
                "audience": config.cloud_tasks_target.rstrip("/"),
            },
        },
    }
    await asyncio.to_thread(client.create_task, request={"parent": parent, "task": task})
    return True


async def archive_export(uid, analysis_id, content):
    config = settings()
    if not config.gcs_bucket or config.app_mode != "live":
        return None
    from google.cloud import storage

    client = storage.Client(project=config.google_cloud_project)
    owner_hash = hashlib.sha256(uid.encode()).hexdigest()
    blob = client.bucket(config.gcs_bucket).blob(f"exports/{owner_hash}/{analysis_id}.json")
    await asyncio.to_thread(blob.upload_from_string, content, content_type="application/json")
    return {"bucket": config.gcs_bucket, "object": blob.name, "access": "private; no public URL created"}


async def publish_metrics(uid, pitch):
    config = settings()
    if (
        not config.bigquery_dataset
        or not pitch.get("analytics_consent")
        or pitch["is_synthetic"]
        or config.app_mode != "live"
    ):
        return
    from google.cloud import bigquery

    client = bigquery.Client(project=config.google_cloud_project)
    row = {
        "session_hash": hashlib.sha256(pitch["id"].encode()).hexdigest(),
        "overall_score": pitch["report"]["overall_score"],
        "difficulty": pitch["difficulty"],
        "answer_count": pitch["answer_count"],
        "created_at": pitch["created_at"],
    }
    errors = await asyncio.to_thread(
        client.insert_rows_json,
        f"{config.google_cloud_project}.{config.bigquery_dataset}.sessions",
        [row],
        row_ids=[row["session_hash"]],
    )
    if errors:
        logger.warning("BigQuery aggregate export unavailable")


async def delete_cloud_data(uid, pitches=None, analysis_id=None):
    config = settings()
    if config.app_mode != "live":
        return
    if config.gcs_bucket:
        from google.api_core.exceptions import NotFound
        from google.cloud import storage

        client = storage.Client(project=config.google_cloud_project)
        prefix = "exports/" + hashlib.sha256(uid.encode()).hexdigest() + "/"
        if analysis_id:
            try:
                await asyncio.to_thread(
                    client.bucket(config.gcs_bucket).blob(prefix + analysis_id + ".json").delete
                )
            except NotFound:
                pass
        else:
            blobs = await asyncio.to_thread(lambda: list(client.list_blobs(config.gcs_bucket, prefix=prefix)))
            for blob in blobs:
                await asyncio.to_thread(blob.delete)
    if config.bigquery_dataset and pitches:
        from google.cloud import bigquery

        client = bigquery.Client(project=config.google_cloud_project)
        hashes = [
            hashlib.sha256(pitch["id"].encode()).hexdigest()
            for pitch in pitches
            if pitch.get("analytics_consent")
        ]
        if hashes:
            job = await asyncio.to_thread(
                client.query,
                f"DELETE FROM `{config.google_cloud_project}.{config.bigquery_dataset}.sessions` WHERE session_hash IN UNNEST(@hashes)",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ArrayQueryParameter("hashes", "STRING", hashes)]
                ),
            )
            await asyncio.to_thread(job.result)


async def cloud_access_token():
    import google.auth
    from google.auth.transport.requests import Request

    credentials, _ = await asyncio.to_thread(
        google.auth.default, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    await asyncio.to_thread(credentials.refresh, Request())
    return credentials.token


async def speech_to_text(audio, language="en-US"):
    token = await cloud_access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://speech.googleapis.com/v1/speech:recognize",
            headers={"Authorization": "Bearer " + token},
            json={
                "config": {
                    "encoding": "WEBM_OPUS",
                    "sampleRateHertz": 48000,
                    "languageCode": language,
                    "enableAutomaticPunctuation": True,
                },
                "audio": {"content": base64.b64encode(audio).decode()},
            },
        )
        response.raise_for_status()
        return " ".join(
            result["alternatives"][0]["transcript"] for result in response.json().get("results", [])
        )


async def text_to_speech(text, investor):
    token = await cloud_access_token()
    voices = {
        "vc": "en-US-Standard-D",
        "operator": "en-US-Standard-B",
        "customer": "en-US-Standard-C",
        "impact": "en-US-Standard-E",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://texttospeech.googleapis.com/v1/text:synthesize",
            headers={"Authorization": "Bearer " + token},
            json={
                "input": {"text": text},
                "voice": {"languageCode": "en-US", "name": voices[investor]},
                "audioConfig": {"audioEncoding": "MP3"},
            },
        )
        response.raise_for_status()
        return base64.b64decode(response.json()["audioContent"])
