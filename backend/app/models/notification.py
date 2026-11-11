import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Notification(Base):
    """Something the user should know: money received, or a security event on their account."""

    __tablename__ = "notifications"
    __table_args__ = (
        # Makes "notify about transfer X" idempotent: the same event can never notify twice.
        # (NULL dedupe keys never collide, so one-off alerts don't need one.)
        UniqueConstraint("user_id", "dedupe_key", name="uq_notifications_user_dedupe"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(32))  # payment_received, new_sign_in, pin_changed, ...
    title: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(String(300))
    dedupe_key: Mapped[str | None] = mapped_column(String(80))
    # What the app needs to write the sentence in the user's language, e.g. {"sender": "Ivan P.", "amount": 1250}
    params: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
