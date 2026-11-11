"""One shared definition of "an account's statement lines", used by the history screen AND the export."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import Account, LedgerEntry, Transfer, User


def history_query(account_id: uuid.UUID) -> Select:
    """Columns: (LedgerEntry, transfer description, counterparty account number, counterparty full name)."""
    # The "other side" of each transfer is whichever account is not this one.
    other_id = case(
        (Transfer.from_account_id == LedgerEntry.account_id, Transfer.to_account_id),
        else_=Transfer.from_account_id,
    )
    other = aliased(Account)
    other_user = aliased(User)
    return (
        select(LedgerEntry, Transfer.description, other.account_number, other_user.full_name)
        .join(Transfer, Transfer.id == LedgerEntry.transfer_id)
        .join(other, other.id == other_id)
        .outerjoin(other_user, other_user.id == other.user_id)
        .where(LedgerEntry.account_id == account_id)
    )


def counterparty_name(full_name: str | None, account_number: str) -> str:
    """Bank-owned accounts have no user: label them by what they are."""
    if full_name:
        return full_name
    if account_number.startswith("SYSTEM-MERCHANTS-"):
        return "Card payment"
    if account_number.startswith("SYSTEM-FX-"):
        return "Currency exchange"
    if account_number.startswith("SYSTEM-SERVICES-"):
        return "Services"
    return "Bank"


# ---------------------------------------------------------------- history across ALL of a user's accounts

@dataclass
class CurrencyTotals:
    currency: str
    income: int  # money that came IN from outside (minor units)
    spending: int  # money that went OUT to outside (minor units, positive number)


@dataclass
class HistoryTotals:
    by_currency: list[CurrencyTotals]  # amounts of different currencies are never added together
    count: int  # how many lines match the filter


def user_lines(user_id: uuid.UUID) -> tuple[Select, object, object]:
    """Every ledger line of every account the user owns, with who was on the other side.
    Returns the SELECT and the aliases of the counterparty and of the user's own account."""
    own = aliased(Account)
    other = aliased(Account)
    other_user = aliased(User)
    other_id = case(
        (Transfer.from_account_id == LedgerEntry.account_id, Transfer.to_account_id),
        else_=Transfer.from_account_id,
    )
    stmt = (
        select(LedgerEntry, Transfer.description, other.account_number, other_user.full_name, own, Transfer.card_id)
        .join(Transfer, Transfer.id == LedgerEntry.transfer_id)
        .join(own, own.id == LedgerEntry.account_id)
        .join(other, other.id == other_id)
        .outerjoin(other_user, other_user.id == other.user_id)
        .where(own.user_id == user_id)
    )
    return stmt, other, own


def user_history(
    db: Session,
    user_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    card_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    flow: str | None = None,  # "in" | "out" | None for both
    before: int | None = None,
    limit: int = 30,
):
    """One page of lines (newest first) plus totals for the WHOLE filter (not just this page)."""
    stmt, other, own = user_lines(user_id)

    def apply(q):
        if account_id is not None:
            q = q.where(LedgerEntry.account_id == account_id)
        if card_id is not None:
            q = q.where(Transfer.card_id == card_id)
        if start is not None:
            q = q.where(LedgerEntry.created_at >= datetime.combine(start, time.min, tzinfo=timezone.utc))
        if end is not None:  # inclusive: everything before the START of the next day
            q = q.where(LedgerEntry.created_at < datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc))
        if flow == "in":
            q = q.where(LedgerEntry.amount > 0)
        elif flow == "out":
            q = q.where(LedgerEntry.amount < 0)
        return q

    filtered = apply(stmt)

    # Totals ignore moves between the user's OWN accounts and both legs of a currency exchange: those are neither income
    # nor spending. They are kept per currency, because $5 and 5 rubles cannot be added.
    external = filtered.with_only_columns(
        LedgerEntry.amount.label("amount"), other.user_id.label("other_user"), own.currency.label("currency"), Transfer.conversion_id.label("conversion")
    ).subquery()
    outside = (or_(external.c.other_user.is_(None), external.c.other_user != user_id)) & (external.c.conversion.is_(None))
    rows = db.execute(
        select(
            external.c.currency,
            func.coalesce(func.sum(case(((external.c.amount > 0) & outside, external.c.amount), else_=0)), 0),
            func.coalesce(func.sum(case(((external.c.amount < 0) & outside, -external.c.amount), else_=0)), 0),
            func.count(),
        ).group_by(external.c.currency)
    ).all()
    totals = HistoryTotals(
        by_currency=[CurrencyTotals(currency=c, income=int(i), spending=int(sp)) for c, i, sp, _n in sorted(rows)],
        count=sum(int(n) for *_x, n in rows),
    )

    page = filtered.order_by(LedgerEntry.id.desc()).limit(limit)
    if before is not None:
        page = page.where(LedgerEntry.id < before)
    return db.execute(page).all(), totals
