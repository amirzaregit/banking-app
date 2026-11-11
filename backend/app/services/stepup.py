"""Step-up checks shared by payments that move money out: the balance, and a one-time SMS code for larger amounts."""

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Account, OtpChallenge, User
from app.services import ledger, otp as otp_service
from app.services.currencies import OTP_THRESHOLD
from app.services.errors import InsufficientFunds, OtpRequired
from app.services.format import format_money
from app.services.phone import mask_phone


def otp_threshold(currency: str) -> int:
    """About $50 in any currency (the USD value is the one the settings, and the tests, can change)."""
    return settings.otp_threshold_cents * OTP_THRESHOLD[currency] // OTP_THRESHOLD["USD"]


def require_code_for_large_amount(
    db: Session,
    user: User,
    *,
    source: Account,
    amount: int,
    request_hash: str,
    idempotency_key: str,
    otp: str | None,
    recipient: str,
    lang: str,
) -> OtpChallenge | None:
    """Enough money? Then, for amounts of about $50 or more, a code tied to THIS exact payment: the first call texts it
    and raises `otp_required`, the second (with `otp`) checks it. Returns the used challenge: delete it with the payment."""
    if ledger.get_balance(db, source.id) < amount:
        raise InsufficientFunds("Insufficient funds")
    if amount < otp_threshold(source.currency):
        return None
    if otp is None:
        otp_service.issue(db, user, idempotency_key, request_hash, amount=format_money(amount, source.currency), recipient=recipient, lang=lang)
        # Name the phone only when there is one: a missing value would reach the app as an unfilled "{{phone}}".
        raise OtpRequired("We sent a 6-digit code. Enter it to confirm this payment.", params={"phone": mask_phone(user.phone)} if user.phone else None)
    return otp_service.verify(db, user, idempotency_key, request_hash, otp)
