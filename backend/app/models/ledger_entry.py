import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LedgerEntry(Base):
    """One line on an account's statement. APPEND-ONLY: a database trigger
    (see the migration) rejects any UPDATE or DELETE."""

    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint("amount <> 0", name="ck_ledger_entries_amount_nonzero"),
        # a transfer touches each account at most once
        UniqueConstraint("transfer_id", "account_id", name="uq_ledger_entries_transfer_account"),
        # powers both "history of account X" and "latest balance of account X"
        Index("ix_ledger_entries_account_id_id", "account_id", "id"),
    )

    # BigInteger identity: gives each account's entries a reliable total order.
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    transfer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transfers.id"))
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"))
    amount: Mapped[int] = mapped_column(BigInteger)  # + money in, - money out (cents)
    balance_after: Mapped[int] = mapped_column(BigInteger)  # running balance after this line
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
