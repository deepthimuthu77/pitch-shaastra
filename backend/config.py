import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv(".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_mode: str = "demo"
    storage_backend: str = "sqlite"
    data_dir: Path = Path("data")
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    public_app_url: str = "http://localhost:3000"
    firebase_project_id: str = ""
    google_cloud_project: str = ""
    google_secret_prefix: str = ""
    gcs_bucket: str = ""
    bigquery_dataset: str = ""
    cloud_logging: bool = False
    google_speech_enabled: bool = False
    cloud_tasks_queue: str = ""
    cloud_tasks_location: str = ""
    cloud_tasks_target: str = ""
    cloud_tasks_service_account: str = ""
    retention_days: int = 30
    max_sessions_per_day: int = 30
    llm_timeout: int = 25
    llm_total_timeout: int = 65

    def validate_runtime(self):
        if self.app_mode not in {"demo", "live"}:
            raise ValueError("APP_MODE must be demo or live")
        if self.storage_backend not in {"sqlite", "firestore"}:
            raise ValueError("STORAGE_BACKEND must be sqlite or firestore")
        if self.app_mode == "live" and not self.firebase_project_id:
            raise ValueError("Live mode requires FIREBASE_PROJECT_ID")
        if self.app_mode == "live" and (
            os.getenv("FIREBASE_AUTH_EMULATOR_HOST") or os.getenv("FIRESTORE_EMULATOR_HOST")
        ):
            raise ValueError("Emulator credentials cannot be used in live mode")
        if "*" in self.allowed_origins:
            raise ValueError("Use explicit ALLOWED_ORIGINS")


@lru_cache
def settings():
    value = Settings()
    value.validate_runtime()
    return value
