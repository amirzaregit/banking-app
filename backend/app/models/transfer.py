import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Numeric,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Transfer(Base):
    """One money movement as the user sees it ("Alice -> Bob, $20").
    Its effect on each account is recorded as two rows in ledger_entries."""

    __tablename__ = "transfers"
    __table_args__ = (
        # Same user + same key = same transfer. NULLs (system deposits) never collide.
        UniqueConstraint("initiated_by", "idempotency_key", name="uq_transfers_user_idempotency_key"),
        CheckConstraint("amount > 0", name="ck_transfers_amount_positive"),
        CheckConstraint("from_account_id <> to_account_id", name="ck_transfers_different_accounts"),
        CheckConstraint("status IN ('completed', 'failed')", name="ck_transfers_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    initiated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    request_hash: Mapped[str | None] = mapped_column(String(64))  # detects key reuse with a different payload
    from_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    to_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    # Set only for card purchases: lets the history screen filter by card without parsing the description.
    card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cards.id"), index=True)
    # A gift sent with a greeting card design ("birthday", "wedding", ...); the message itself is the description.
    gift_design: Mapped[str | None] = mapped_column(String(20))
    # Paying a bill (mobile, utilities, ...): which provider received it.
    service_provider: Mapped[str | None] = mapped_column(String(40))
    # The payment request (link / QR) this transfer settled.
    request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payment_requests.id"), index=True)
    # Set on BOTH legs of a currency conversion (one transfer per currency, linked by this id) with the rate used.
    conversion_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(30, 12))
    amount: Mapped[int] = mapped_column(BigInteger)  # minor units (cents)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(20), default="completed", server_default="completed")
    description: Mapped[str | None] = mapped_column(String(140))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
