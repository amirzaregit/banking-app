import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BlockRequest(Base):
    """A customer's request to block an account or a card, with the reason.

    Ready-made reasons block at once (`applied`). A free-text reason has to be read by a specialist first
    (`pending_review`), so nothing is blocked until it is `approved`."""

    __tablename__ = "block_requests"
    __table_args__ = (
        CheckConstraint("target IN ('account', 'card')", name="ck_block_requests_target"),
        CheckConstraint("status IN ('applied', 'pending_review', 'approved', 'rejected')", name="ck_block_requests_status"),
        CheckConstraint("(target = 'card') = (card_id IS NOT NULL)", name="ck_block_requests_card_matches_target"),
        # One open review per account/card, enforced by the database.
        Index("uq_block_requests_one_open_account", "account_id", unique=True, postgresql_where=text("status = 'pending_review' AND target = 'account'")),
        Index("uq_block_requests_one_open_card", "card_id", unique=True, postgresql_where=text("status = 'pending_review' AND target = 'card'")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cards.id"))
    target: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str] = mapped_column(String(30))
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
