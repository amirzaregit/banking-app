# Backend

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL. Business rules live in `app/services`; see
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the design and [../docs/API.md](../docs/API.md) for every endpoint
(interactive docs at <http://localhost:8000/docs> when running).

## Layout

```
app/
  main.py            app factory, error handlers, router registration
  core/              config (env), security (JWT, argon2), database session
  api/deps.py        current user, language, rate limits
  api/routes/        one file per area: auth, accounts, transfers, conversions, cards, requests, bills, certificates ...
  services/          all rules: ledger, conversion, stepup, pin, otp, currencies, rates, bills, certificates, errors ...
  models/            SQLAlchemy tables
  schemas/           request / response models
alembic/versions/    migrations (the only way the schema changes)
scripts/             seed_demo.py, generate_api_docs.py
tests/               pytest, runs against a real PostgreSQL
```

## Run

Normally via Docker from the repository root (`docker compose up -d --build`), which applies migrations on start. Without Docker:

```bash
python -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/alembic upgrade head
./venv/bin/uvicorn app.main:app --reload
```

Reproducible versions of every dependency are in `requirements.lock.txt`.

Demo data (users, accounts, history):

```bash
docker compose exec api python -m scripts.seed_demo
```

Sign in as `ivan@example.com`; the seed script prints the other users.

## Configuration

Environment variables (or a `.env` file); defaults are in [app/core/config.py](app/core/config.py).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | local dev Postgres | SQLAlchemy URL |
| `SECRET_KEY` | dev value | Signs tokens and hashes one-time codes. **Must** be 32+ random chars in production |
| `ENVIRONMENT` | `development` | `production` enables startup safety checks (secret, DB password, https-only CORS) |
| `DEMO_MODE` | `true` | Enables fake deposits, top-up, SMS inbox, card simulator |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | 15 / 30 | Token lifetimes |
| `DEFAULT_PHONE_REGION` | `RU` | Region for numbers typed without a country code |
| `RATES_CACHE_SECONDS` | 3600 | How long fetched exchange rates are reused |
| `CERTIFICATE_INTERVAL_SECONDS` | 5 | Minimum gap between a user's certificates (0 = off) |
| `LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_SECONDS` | 5 / 900 | Sign-in throttling |
| `PIN_MAX_ATTEMPTS` / `PIN_LOCK_MINUTES` | 5 / 15 | Payment PIN lockout |
| `OTP_THRESHOLD_CENTS` | 5000 | Payments at or above this (USD-equivalent) need a one-time code |
| `OTP_TTL_SECONDS` / `OTP_MAX_ATTEMPTS` | 300 / 5 | One-time code lifetime and tries |
| `CORS_ORIGINS` | localhost:8081 | JSON list; only the web dev build needs it |

## Migrations

```bash
./venv/bin/alembic revision --autogenerate -m "describe the change"   # then READ the result
./venv/bin/alembic upgrade head
```

Triggers, partial indexes and check constraints are written by hand in migrations; autogenerate does not see them.

## Tests

```bash
./venv/bin/python -m pytest          # everything
./venv/bin/python -m pytest -k conversion
./venv/bin/ruff check .              # lint
```

Tests use a real PostgreSQL database named `banking_test`, created from the migrations. Connection settings come from `TEST_PG_*`
environment variables (host, port, user, password); the defaults match the Docker database. Each test rolls back; the concurrency tests use
real threads and committed rows and clean up after themselves.

## Conventions

- Services take a session and **never commit**; routes commit once.
- Money is an integer in minor units; currency rules live only in `services/currencies.py`.
- New failures are `AppError` subclasses with a stable `code` and `params`; add the translation to all three app catalogs.
- Every endpoint has a docstring (it becomes the API reference). After changing endpoints regenerate it:
  `./venv/bin/python -m scripts.generate_api_docs`.
- Comments explain *why*, not what.
