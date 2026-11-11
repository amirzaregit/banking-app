"""Production safety: security headers and the fail-closed startup checks."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import DEFAULT_SECRET, Settings, production_problems, settings
from app.main import app

STRONG = "x" * 40


def prod(**overrides) -> Settings:
    base = {
        "environment": "production",
        "secret_key": STRONG,
        "database_url": "postgresql+psycopg://bank:s3cret-pass@db:5432/banking",
        "cors_origins": [],
    }
    return Settings(**{**base, **overrides})


def test_responses_are_never_cached_and_not_sniffable(client):
    r = client.get("/health")
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_error_responses_carry_the_headers_too(client):
    r = client.get("/accounts")  # 401
    assert r.status_code == 401 and r.headers["cache-control"] == "no-store"


def test_hsts_only_appears_in_production(client, monkeypatch):
    assert "strict-transport-security" not in client.get("/health").headers
    monkeypatch.setattr(settings, "environment", "production")
    assert "max-age=" in client.get("/health").headers["strict-transport-security"]


def test_a_well_configured_production_has_no_problems():
    assert production_problems(prod()) == []


def test_development_is_never_blocked():
    assert production_problems(Settings(environment="development", secret_key=DEFAULT_SECRET)) == []


@pytest.mark.parametrize(
    "overrides, fragment",
    [
        ({"secret_key": DEFAULT_SECRET}, "SECRET_KEY"),
        ({"secret_key": "too-short"}, "SECRET_KEY"),
        ({"database_url": "postgresql+psycopg://bank:bank@db:5432/banking"}, "default development password"),
        ({"cors_origins": ["http://evil.example"]}, "plain-http"),
    ],
)
def test_insecure_production_settings_are_reported(overrides, fragment):
    assert any(fragment in p for p in production_problems(prod(**overrides)))


def test_the_server_refuses_to_start_insecurely_in_production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")  # key is still the default
    with pytest.raises(RuntimeError, match="Refusing to start in production"):
        with TestClient(app):
            pass
