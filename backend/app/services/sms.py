"""The demo's fake SMS gateway. A real deployment would call an SMS provider here."""

import logging

from sqlalchemy.orm import Session

from app.models import SmsMessage, User
from app.services.phone import mask_phone

log = logging.getLogger("sms")


def send_sms(db: Session, user: User, body: str) -> None:
    """'Send' a text by storing it. Added to the caller's transaction (the caller commits).

    We log only WHO got a message, never its content: codes must not end up in log files.
    """
    db.add(SmsMessage(user_id=user.id, phone=user.phone or "", body=body))
    log.info("SMS queued for %s", mask_phone(user.phone) if user.phone else "user without phone")
