"""One-time codes that approve ONE specific larger payment."""

import hashlib
import hmac
import math
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import OtpChallenge, User
from app.services import sms, texts
from app.services.errors import OtpInvalid, TooManyRequests
from app.services.ratelimit import limiter

EXPIRED = "That code has expired or is no longer valid. Request a new one."


def _hash_code(challenge_id: uuid.UUID, code: str) -> str:
    """Keyed hash: the database never holds a readable code."""
    return hmac.new(settings.secret_key.encode(), f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def issue(
    db: Session,
    user: User,
    idempotency_key: str,
    request_hash: str,
    *,
    amount: str,
    recipient: str,
    lang: str = "en",
) -> None:
    """Create (or replace) the code for this payment and 'text' it to the user. COMMITS.

    Commits because the caller is about to raise "code required", which would otherwise
    roll the new code back.
    """
    retry_after = limiter.check("otp_send", str(user.id), limit=5, window=600)
    if retry_after is not None:
        raise TooManyRequests(
            f"Too many codes requested. Try again in {max(1, math.ceil(retry_after / 60))} min.",
            headers={"Retry-After": str(math.ceil(retry_after))},
            params={"minutes": max(1, math.ceil(retry_after / 60))},
        )

    code = f"{secrets.randbelow(10**6):06d}"
    for attempt in range(2):
        challenge = db.scalar(
            select(OtpChallenge).where(OtpChallenge.user_id == user.id, OtpChallenge.idempotency_key == idempotency_key)
        )
        if challenge is None:
            challenge = OtpChallenge(id=uuid.uuid4(), user_id=user.id, idempotency_key=idempotency_key)
            db.add(challenge)
        challenge.request_hash = request_hash
        challenge.code_hash = _hash_code(challenge.id, code)  # a new code invalidates the old one
        challenge.expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.otp_ttl_seconds)
        challenge.attempts = 0
        try:
            sms.send_sms(db, user, texts.otp_sms(lang, code, amount, recipient))
            db.commit()
            return
        except IntegrityError:  # two requests created the challenge at once: retry as an update
            db.rollback()
            if attempt == 1:
                raise


def verify(db: Session, user: User, idempotency_key: str, request_hash: str, code: str) -> OtpChallenge:
    """Return the challenge if `code` is right for THIS payment, else raise.

    The caller deletes the returned challenge in the same transaction as the payment.
    A wrong guess commits its strike immediately (see pin.verify_pin for why).
    """
    challenge = db.scalar(
        select(OtpChallenge)
        .where(OtpChallenge.user_id == user.id, OtpChallenge.idempotency_key == idempotency_key)
        .with_for_update()  # serialize guesses on this challenge
    )
    now = datetime.now(timezone.utc)
    if (
        challenge is None
        or challenge.request_hash != request_hash  # issued for a DIFFERENT payment
        or challenge.expires_at <= now
        or challenge.attempts >= settings.otp_max_attempts
    ):
        raise OtpInvalid(EXPIRED, code="otp_expired")

    if not hmac.compare_digest(challenge.code_hash, _hash_code(challenge.id, code)):
        challenge.attempts += 1
        db.commit()
        left = settings.otp_max_attempts - challenge.attempts
        if left <= 0:
            raise OtpInvalid("Too many wrong codes. Request a new one.", code="otp_expired")
        raise OtpInvalid(f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left.", params={"left": left})
    return challenge
