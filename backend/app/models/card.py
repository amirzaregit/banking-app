import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Card(Base):
    """A virtual debit card on an account. We keep only the last 4 digits: a real system
    would hold the full number in a PCI-compliant vault, never in an ordinary table."""

    __tablename__ = "cards"
    __table_args__ = (CheckConstraint("status IN ('active', 'frozen', 'blocked')", name="ck_cards_status"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    last4: Mapped[str] = mapped_column(String(4))
    expiry_month: Mapped[int] = mapped_column(Integer)
    expiry_year: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
