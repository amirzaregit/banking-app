import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SmsMessage(Base):
    """The demo's fake SMS gateway: 'sent' messages are just rows the app can display.
    A real deployment would hand the text to an SMS provider instead."""

    __tablename__ = "sms_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    phone: Mapped[str] = mapped_column(String(16))
    body: Mapped[str] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
