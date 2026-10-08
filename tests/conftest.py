import pytest

from backend.config import settings
from backend.store import store


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    settings.cache_clear()
    store.cache_clear()
    yield
    settings.cache_clear()
    store.cache_clear()
