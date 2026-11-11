import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PaymentRequest(Base):
    """"Please pay me": a shareable request (a link or QR code) for money into one of the owner's accounts.
    The amount may be left open, so the payer chooses it. The token in the link is random and unguessable."""

    __tablename__ = "payment_requests"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'paid', 'cancelled')", name="ck_payment_requests_status"),
        CheckConstraint("amount IS NULL OR amount > 0", name="ck_payment_requests_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    token: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"))
    amount: Mapped[int | None] = mapped_column(BigInteger)  # minor units; None = the payer chooses
    currency: Mapped[str] = mapped_column(String(3))
    note: Mapped[str | None] = mapped_column(String(140))
    status: Mapped[str] = mapped_column(String(12), default="open", server_default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
