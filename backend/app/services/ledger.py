"""Money movement. Every rule about moving money lives here.

Functions in this module never commit: the caller owns the transaction, so a
transfer's two ledger rows are saved together or not at all.
"""

import hashlib
import uuid
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Account, AccountStatus, AccountType, LedgerEntry, Transfer
from app.services.currencies import system_account_number
from app.services.errors import (
    AccountNotActive,
    IdempotencyConflict,
    InsufficientFunds,
    InvalidTransfer,
    NotFound,
)

RESERVE_ACCOUNT_NUMBER = system_account_number("RESERVE", "USD")  # the USD ones; other currencies have their own
MERCHANT_ACCOUNT_NUMBER = system_account_number("MERCHANTS", "USD")  # where USD card purchases are settled


# ---------------------------------------------------------------- balances

def get_balance(db: Session, account_id: uuid.UUID) -> int:
    """Current balance = balance_after of the newest ledger row (0 if none)."""
    latest = db.scalar(
        select(LedgerEntry.balance_after)
        .where(LedgerEntry.account_id == account_id)
        .order_by(LedgerEntry.id.desc())
        .limit(1)
    )
    return latest or 0


def get_balances(db: Session, account_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Balances for many accounts in ONE query (avoids N+1).

    DISTINCT ON (account_id) + ORDER BY id DESC keeps only the newest row
    per account. This is Postgres-specific SQL.
    """
    if not account_ids:
        return {}
    rows = db.execute(
        select(LedgerEntry.account_id, LedgerEntry.balance_after)
        .where(LedgerEntry.account_id.in_(account_ids))
        .ext(distinct_on(LedgerEntry.account_id))
        .order_by(LedgerEntry.account_id, LedgerEntry.id.desc())
    ).all()
    found = dict(rows)
    return {a: found.get(a, 0) for a in account_ids}


# ---------------------------------------------------------------- transfers

def lock_accounts(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, Account]:
    """Lock accounts for the rest of the transaction.

    ORDER BY id => every transaction locks in the same order => no deadlocks.
    populate_existing => refresh objects SQLAlchemy may have cached.
    """
    rows = db.scalars(
        select(Account)
        .where(Account.id.in_(ids))
        .order_by(Account.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    return {a.id: a for a in rows}


def _request_hash(from_id: uuid.UUID, to_id: uuid.UUID, amount: int, currency: str) -> str:
    return hashlib.sha256(f"{from_id}|{to_id}|{amount}|{currency}".encode()).hexdigest()


def find_replay(
    db: Session,
    *,
    initiated_by: uuid.UUID,
    idempotency_key: str,
    from_account_id: uuid.UUID,
    to_account_id: uuid.UUID,
    amount: int,
    currency: str,
) -> Transfer | None:
    """Has this exact request already been processed? Returns the original transfer if so,
    raises if the key was used for a DIFFERENT request, and returns None if it's new."""
    existing = db.scalar(
        select(Transfer).where(
            Transfer.initiated_by == initiated_by,
            Transfer.idempotency_key == idempotency_key,
        )
    )
    if existing is None:
        return None
    if existing.request_hash != _request_hash(from_account_id, to_account_id, amount, currency):
        raise IdempotencyConflict("Idempotency key was already used for a different request")
    return existing


def request_hash(from_account_id: uuid.UUID, to_account_id: uuid.UUID, amount: int, currency: str) -> str:
    """Fingerprint of a payment's details (used to bind one-time codes to one payment)."""
    return _request_hash(from_account_id, to_account_id, amount, currency)


def post_transfer(
    db: Session,
    *,
    from_account_id: uuid.UUID,
    to_account_id: uuid.UUID,
    amount: int,
    initiated_by: uuid.UUID | None,
    idempotency_key: str | None = None,
    description: str | None = None,
    card_id: uuid.UUID | None = None,
    conversion_id: uuid.UUID | None = None,
    fx_rate: Decimal | None = None,
    gift_design: str | None = None,
    service_provider: str | None = None,
    request_id: uuid.UUID | None = None,
) -> Transfer:
    """Move `amount` (minor units) between two accounts of the SAME currency by appending two ledger rows."""
    if amount <= 0:
        raise InvalidTransfer("Amount must be positive", code="invalid_amount")
    if from_account_id == to_account_id:
        raise InvalidTransfer("Cannot transfer to the same account", code="same_account")

    # 1. Lock both accounts. From here on nobody else can move their money.
    accounts = lock_accounts(db, [from_account_id, to_account_id])
    src, dst = accounts.get(from_account_id), accounts.get(to_account_id)
    if src is None or dst is None:
        raise NotFound("Account not found", code="account_not_found")
    request_hash = _request_hash(src.id, dst.id, amount, src.currency)

    # 2. Idempotency: have we already done this exact request?
    if idempotency_key and initiated_by:
        existing = db.scalar(
            select(Transfer).where(
                Transfer.initiated_by == initiated_by,
                Transfer.idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            if existing.request_hash != request_hash:
                raise IdempotencyConflict("Idempotency key was already used for a different request")
            return existing  # replay: return the original result, move no money

    # 3. Business rules
    if src.status != AccountStatus.ACTIVE.value or dst.status != AccountStatus.ACTIVE.value:
        raise AccountNotActive("Both accounts must be active", code="account_not_active")
    if src.currency != dst.currency:
        raise InvalidTransfer("Currency mismatch", code="currency_mismatch")

    src_balance = get_balance(db, src.id)
    dst_balance = get_balance(db, dst.id)
    if src.type != AccountType.SYSTEM.value and src_balance < amount:
        raise InsufficientFunds("Insufficient funds")

    # 4. Write the transfer and its two ledger rows (nothing is committed yet).
    transfer = Transfer(
        initiated_by=initiated_by,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        from_account_id=src.id,
        to_account_id=dst.id,
        amount=amount,
        currency=src.currency,
        description=description,
        card_id=card_id,
        conversion_id=conversion_id,
        fx_rate=fx_rate,
        gift_design=gift_design,
        service_provider=service_provider,
        request_id=request_id,
    )
    try:
        db.add(transfer)
        db.flush()  # assigns transfer.id; also trips the UNIQUE constraint if we lost a race
    except IntegrityError:
        db.rollback()
        raise IdempotencyConflict("Duplicate idempotency key") from None

    db.add_all(
        [
            LedgerEntry(
                transfer_id=transfer.id,
                account_id=src.id,
                amount=-amount,
                balance_after=src_balance - amount,
            ),
            LedgerEntry(
                transfer_id=transfer.id,
                account_id=dst.id,
                amount=amount,
                balance_after=dst_balance + amount,
            ),
        ]
    )
    db.flush()
    return transfer


def _system_account(db: Session, kind: str, currency: str) -> Account:
    number = system_account_number(kind, currency)
    account = db.scalar(select(Account).where(Account.account_number == number))
    if account is None:
        raise RuntimeError(f"System account {number} missing; run ensure_system_accounts()")
    return account


def get_reserve_account(db: Session, currency: str = "USD") -> Account:
    return _system_account(db, "RESERVE", currency)


def get_merchant_account(db: Session, currency: str = "USD") -> Account:
    return _system_account(db, "MERCHANTS", currency)


def get_services_account(db: Session, currency: str) -> Account:
    """Where bill payments (mobile, utilities, taxes...) settle."""
    return _system_account(db, "SERVICES", currency)


def get_fx_account(db: Session, currency: str) -> Account:
    """The bank's pool for one currency: the other side of every conversion in that currency."""
    return _system_account(db, "FX", currency)


def deposit(db: Session, *, account_id: uuid.UUID, amount: int, description: str = "Deposit") -> Transfer:
    """Demo money-in: the bank's reserve account pays the customer.
    (Reserve goes negative: it represents money the bank has issued.)"""
    account = db.get(Account, account_id)
    if account is None:
        raise NotFound("Account not found", code="account_not_found")
    reserve = get_reserve_account(db, account.currency)
    return post_transfer(
        db,
        from_account_id=reserve.id,
        to_account_id=account_id,
        amount=amount,
        initiated_by=None,
        description=description,
    )


# ---------------------------------------------------------------- audit

def verify_ledger(db: Session) -> list[str]:
    """Check every ledger invariant. Returns a list of problems (empty = healthy)."""
    problems: list[str] = []

    total = db.scalar(text("SELECT COALESCE(SUM(amount), 0) FROM ledger_entries"))
    if total != 0:
        problems.append(f"Ledger does not sum to zero (off by {total})")

    unbalanced = db.scalar(
        text(
            "SELECT COUNT(*) FROM (SELECT 1 FROM ledger_entries GROUP BY transfer_id "
            "HAVING SUM(amount) <> 0 OR COUNT(*) <> 2) t"
        )
    )
    if unbalanced:
        problems.append(f"{unbalanced} transfer(s) are not exactly two cancelling entries")

    drift = db.scalar(
        text(
            "SELECT COUNT(*) FROM ("
            "  SELECT balance_after, SUM(amount) OVER (PARTITION BY account_id ORDER BY id) AS running "
            "  FROM ledger_entries) t WHERE balance_after <> running"
        )
    )
    if drift:
        problems.append(f"{drift} entr(ies) have a balance_after that disagrees with the running sum")

    # Money of different currencies never mixes: each currency must balance on its own, and every ledger row must sit
    # on an account of the same currency as its transfer.
    per_currency = db.execute(
        text(
            "SELECT a.currency, SUM(e.amount) FROM ledger_entries e JOIN accounts a ON a.id = e.account_id "
            "GROUP BY a.currency HAVING SUM(e.amount) <> 0"
        )
    ).all()
    for currency, off_by in per_currency:
        problems.append(f"{currency} ledger does not sum to zero (off by {off_by})")

    mixed = db.scalar(
        text(
            "SELECT COUNT(*) FROM ledger_entries e JOIN accounts a ON a.id = e.account_id "
            "JOIN transfers t ON t.id = e.transfer_id WHERE a.currency <> t.currency"
        )
    )
    if mixed:
        problems.append(f"{mixed} entr(ies) are in a different currency than their transfer")

    negative = db.scalar(
        text(
            "SELECT COUNT(*) FROM ledger_entries e JOIN accounts a ON a.id = e.account_id "
            "WHERE a.type <> 'system' AND e.balance_after < 0"
        )
    )
    if negative:
        problems.append(f"{negative} entr(ies) put a customer account below zero")

    return problems
