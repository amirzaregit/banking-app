from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import production_problems, settings
from app.api.routes import accounts, auth, bills, card_services, cards, certificates, conversions, requests as payment_requests, history, insurance, notifications, rates, recipients, sms, transactions, transfers, users
from app.db.seed import ensure_system_accounts
from app.db.session import SessionLocal, engine
from app.services.errors import DomainError


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once at server start. Refuse to run insecurely in production.
    problems = production_problems(settings)
    if problems:
        raise RuntimeError("Refusing to start in production: " + "; ".join(problems))
    with SessionLocal() as db:
        ensure_system_accounts(db)
    yield


app = FastAPI(title="Banking Demo API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(accounts.router)
app.include_router(bills.router)
app.include_router(cards.router)
app.include_router(card_services.router)
app.include_router(payment_requests.router)
app.include_router(certificates.router)
app.include_router(conversions.router)
app.include_router(history.router)
app.include_router(insurance.router)
app.include_router(notifications.router)
app.include_router(rates.router)
app.include_router(recipients.router)
app.include_router(sms.router)
app.include_router(transactions.router)
app.include_router(transfers.router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"  # banking data must not be cached anywhere
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if settings.environment == "production":  # only meaningful (and only safe) over HTTPS
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    body: dict = {"detail": exc.detail}
    if exc.code:
        body["code"] = exc.code
    if exc.params:
        body["params"] = exc.params
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Same shape FastAPI always used, plus a code so the app can show a translated message."""
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors()), "code": "validation_error"})


@app.get("/health", tags=["meta"])
def health():
    """Liveness check used by Docker and the load balancer."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}
