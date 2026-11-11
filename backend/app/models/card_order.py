import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CardOrder(Base):
    """A request for a plastic card for one account. The branch makes it; the customer is told in the app (or by phone)."""

    __tablename__ = "card_orders"
    __table_args__ = (
        CheckConstraint("theme IN ('light', 'dark')", name="ck_card_orders_theme"),
        CheckConstraint("status IN ('pending', 'ready')", name="ck_card_orders_status"),
        CheckConstraint("notify_by IN ('app', 'phone')", name="ck_card_orders_notify"),
        # One card in production per account at a time: the database decides, so two taps cannot order twice.
        Index("uq_card_orders_one_pending", "account_id", unique=True, postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    theme: Mapped[str] = mapped_column(String(10))
    branch_id: Mapped[str] = mapped_column(String(30))
    notify_by: Mapped[str] = mapped_column(String(10), default="app", server_default="app")
    status: Mapped[str] = mapped_column(String(10), default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
