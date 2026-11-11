import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AccountType(str, enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    SYSTEM = "system"  # bank-owned accounts (e.g. the cash reserve); no user


class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    FROZEN = "frozen"
    CLOSED = "closed"


class Account(Base):
    """A pot of money. Note: there is deliberately NO balance column.
    The balance is derived from ledger_entries."""

    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("type IN ('checking', 'savings', 'system')", name="ck_accounts_type"),
        CheckConstraint("status IN ('active', 'frozen', 'closed')", name="ck_accounts_status"),
        # system account <=> no owner
        CheckConstraint("(type = 'system') = (user_id IS NULL)", name="ck_accounts_owner_matches_type"),
        # At most ONE default receiving account per user (partial unique index).
        Index(
            "uq_accounts_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    account_number: Mapped[str] = mapped_column(String(32), unique=True)
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    status: Mapped[str] = mapped_column(
        String(20), default=AccountStatus.ACTIVE.value, server_default="active"
    )
    # The account that receives payments sent to the owner's phone number.
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
