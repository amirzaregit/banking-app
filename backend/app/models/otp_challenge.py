import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OtpChallenge(Base):
    """A one-time code issued for ONE specific payment.

    Identified by (user, idempotency key) and bound to a hash of the payment details, so
    a code issued for "$60 to Bob" can never approve "$600 to Mallory".
    """

    __tablename__ = "otp_challenges"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_otp_challenges_user_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64))
    request_hash: Mapped[str] = mapped_column(String(64))
    code_hash: Mapped[str] = mapped_column(String(64))  # never the code itself
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
