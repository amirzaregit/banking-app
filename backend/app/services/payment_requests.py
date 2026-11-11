"""Payment requests: "please pay me", as a link or a QR code."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, PaymentRequest, User
from app.services.currencies import MAX_TRANSFER
from app.services.errors import DomainError, NotFound

TTL_DAYS = 7
MAX_OPEN_PER_USER = 50
PAY_URL = "https://demo-bank.example/pay/"  # the link people share; the app also accepts the bare token


def link_for(token: str) -> str:
    return f"{PAY_URL}{token}"


def token_from_text(text: str) -> str:
    """Accept a pasted link, a scanned QR code or the bare token."""
    text = text.strip().rstrip("/")
    return text.rsplit("/", 1)[-1]


def effective_status(request: PaymentRequest, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if request.status == "open" and request.expires_at <= now:
        return "expired"
    return request.status


def create(db: Session, user: User, account: Account, amount: int | None, note: str | None) -> PaymentRequest:
    if account.status != "active":
        raise DomainError("Only an active account can receive payments", code="account_not_active", status_code=422)
    if amount is not None and amount > MAX_TRANSFER[account.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)
    open_now = db.scalars(select(PaymentRequest.id).where(PaymentRequest.user_id == user.id, PaymentRequest.status == "open")).all()
    if len(open_now) >= MAX_OPEN_PER_USER:
        raise DomainError("Too many open requests", code="too_many_requests_open", status_code=422, params={"max": MAX_OPEN_PER_USER})
    request = PaymentRequest(
        token=secrets.token_urlsafe(12),
        user_id=user.id,
        account_id=account.id,
        amount=amount,
        currency=account.currency,
        note=(note or "").strip() or None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=TTL_DAYS),
    )
    db.add(request)
    db.flush()
    return request


def get_by_token(db: Session, token: str, *, lock: bool = False) -> PaymentRequest:
    stmt = select(PaymentRequest).where(PaymentRequest.token == token)
    if lock:
        stmt = stmt.with_for_update()
    request = db.scalar(stmt)
    if request is None:
        raise NotFound("Payment request not found", code="request_not_found")
    return request


def check_payable(request: PaymentRequest, *, payer_id: uuid.UUID, dest_account_id: uuid.UUID, amount: int) -> None:
    """May this payment settle this request? Raises a specific error otherwise."""
    status = effective_status(request)
    if status != "open":
        raise DomainError("This request is no longer open", code=f"request_{status}", status_code=409)
    if request.user_id == payer_id:
        raise DomainError("You cannot pay your own request", code="request_own", status_code=422)
    if dest_account_id != request.account_id:
        raise DomainError("This payment does not match the request", code="request_mismatch", status_code=422)
    if request.amount is not None and amount != request.amount:
        raise DomainError("The amount must match the request", code="request_amount", status_code=422, params={"amount": request.amount, "currency": request.currency})
