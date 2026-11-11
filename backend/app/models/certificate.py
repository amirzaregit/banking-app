import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Certificate(Base):
    """An official letter the bank issued to a customer. The facts are FROZEN at issue time (a snapshot), so the same
    reference number always shows the same document, even after balances change."""

    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    type: Mapped[str] = mapped_column(String(32))
    language: Mapped[str] = mapped_column(String(2))
    ref_number: Mapped[str] = mapped_column(String(32), unique=True)
    period_from: Mapped[date | None] = mapped_column(Date)
    period_to: Mapped[date | None] = mapped_column(Date)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
