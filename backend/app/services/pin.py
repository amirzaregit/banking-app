"""The payment PIN: a second secret asked for at the moment money moves."""

import math
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import User
from app.services import notifications
from app.services.errors import PinInvalid, PinLocked, PinNotSet, WeakPin

_SIX_DIGITS = re.compile(r"\d{6}")


def validate_pin_format(pin: str) -> None:
    """Exactly 6 digits, and not something a thief would try first."""
    if not _SIX_DIGITS.fullmatch(pin):
        raise WeakPin("The PIN must be exactly 6 digits.", params={"reason": "format"})
    digits = [int(c) for c in pin]
    steps = [b - a for a, b in zip(digits, digits[1:], strict=False)]  # pairs of neighbours: one shorter than the PIN
    weak = (
        len(set(digits)) == 1  # 000000, 111111
        or all(s == 1 for s in steps)  # 123456
        or all(s == -1 for s in steps)  # 654321
        or pin[:3] == pin[3:]  # 123123
        or pin[:2] * 3 == pin  # 121212
    )
    if weak:
        raise WeakPin("That PIN is too easy to guess. Avoid repeats and sequences like 123456.", params={"reason": "weak"})


def set_pin(db: Session, user: User, pin: str) -> None:
    """Store the hash and clear any lockout. The caller commits."""
    validate_pin_format(pin)
    user.pin_hash = hash_password(pin)
    user.pin_failed_attempts = 0
    user.pin_locked_until = None


def verify_pin(db: Session, user: User, pin: str) -> None:
    """Raises unless `pin` is right. Wrong guesses are counted and eventually lock the PIN.

    IMPORTANT: this COMMITS the failure counter before raising. Normally a failed request
    rolls everything back, which would erase the very strike we are trying to record.
    """
    now = datetime.now(timezone.utc)

    # Locked? Refuse BEFORE checking the PIN, so a locked PIN can't be used as a guessing oracle.
    if user.pin_locked_until is not None and user.pin_locked_until > now:
        minutes = max(1, math.ceil((user.pin_locked_until - now).total_seconds() / 60))
        raise PinLocked(
            f"Too many wrong PINs. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            headers={"Retry-After": str(minutes * 60)},
            params={"minutes": minutes},
        )
    if user.pin_hash is None:
        raise PinNotSet("Set a payment PIN first.")

    if verify_password(pin, user.pin_hash):
        user.pin_failed_attempts = 0  # saved with the caller's commit
        return

    # Atomic in SQL: two simultaneous wrong guesses can't both read "4" and both write "5".
    failures = db.execute(
        update(User)
        .where(User.id == user.id)
        .values(pin_failed_attempts=User.pin_failed_attempts + 1)
        .returning(User.pin_failed_attempts)
    ).scalar_one()

    if failures >= settings.pin_max_attempts:
        locked_until = now + timedelta(minutes=settings.pin_lock_minutes)
        db.execute(
            update(User).where(User.id == user.id).values(pin_failed_attempts=0, pin_locked_until=locked_until)
        )
        notifications.notify(
            db,
            user.id,
            "pin_locked",
            "Payment PIN locked",
            f"Too many wrong PINs. Payments are blocked for {settings.pin_lock_minutes} minutes. If this wasn't you, change your password.",
            params={"minutes": settings.pin_lock_minutes},
        )
        db.commit()
        raise PinLocked(
            f"Too many wrong PINs. Locked for {settings.pin_lock_minutes} minutes.",
            headers={"Retry-After": str(settings.pin_lock_minutes * 60)},
            params={"minutes": settings.pin_lock_minutes},
        )

    db.commit()
    left = settings.pin_max_attempts - failures
    raise PinInvalid(f"Incorrect PIN. {left} attempt{'s' if left != 1 else ''} left.", params={"left": left})
