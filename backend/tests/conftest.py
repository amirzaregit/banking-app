import itertools
import os
from pathlib import Path

import psycopg
import pytest

# Where the test Postgres lives. Defaults match docker-compose.yml; CI overrides them.
_PG = {
    "user": os.environ.get("TEST_PG_USER", "bank"),
    "password": os.environ.get("TEST_PG_PASSWORD", "bank"),
    "host": os.environ.get("TEST_PG_HOST", "localhost"),
    "port": os.environ.get("TEST_PG_PORT", "5444"),
}
TEST_DB = "banking_test"
ADMIN_URL = "postgresql://{user}:{password}@{host}:{port}/postgres".format(**_PG)
os.environ["DATABASE_URL"] = "postgresql+psycopg://{user}:{password}@{host}:{port}/".format(**_PG) + TEST_DB

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.seed import ensure_system_accounts
from app.db.session import SessionLocal, engine
from app.main import app
from app.services import rates as rates_service
from app.services.ratelimit import limiter

BACKEND = Path(__file__).resolve().parent.parent

TEST_PIN = "482915"  # not a weak PIN
TEST_PASSWORD = "correct-horse-1"
_phone_counter = itertools.count(1)


def fake_phone() -> str:
    """A valid, unique Russian mobile number: +7 912 000 0001, 0002, ..."""
    return f"+7912000{next(_phone_counter):04d}"


@pytest.fixture(scope="session", autouse=True)
def _database():
    """Fresh test DB, built with the REAL migrations (so triggers/constraints are tested)."""
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        conn.execute(f"CREATE DATABASE {TEST_DB}")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables():
    # TRUNCATE doesn't fire the append-only (row-level) trigger, so it can reset the ledger.
    with engine.begin() as conn:
        conn.execute(
            text("TRUNCATE ledger_entries, transfers, accounts, refresh_tokens, users CASCADE")
        )
    with SessionLocal() as db:
        ensure_system_accounts(db)
    limiter.reset()  # rate-limit counters must not leak between tests
    rates_service.reset_cache()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    return TestClient(app)


def register_and_login(client, email, name="Test", device="phone", phone=None):
    creds = {"email": email, "password": "correct-horse-1"}
    r = client.post("/auth/register", json={**creds, "full_name": name, "phone": phone or fake_phone()})
    assert r.status_code == 201, r.text
    r = client.post("/auth/login", json={**creds, "device_name": device})
    assert r.status_code == 200, r.text
    tokens = r.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    r = client.put("/users/me/pin", json={"pin": TEST_PIN, "password": TEST_PASSWORD}, headers=headers)
    assert r.status_code == 204, r.text
    return headers


@pytest.fixture
def user(client):
    creds = {"email": "alice@example.com", "password": "correct-horse-1"}
    r = client.post("/auth/register", json={**creds, "full_name": "Alice", "phone": fake_phone()})
    assert r.status_code == 201
    return creds


def login(client, creds, device="iPhone"):
    r = client.post("/auth/login", json={**creds, "device_name": device})
    assert r.status_code == 200, r.text
    return r.json()


def auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}
