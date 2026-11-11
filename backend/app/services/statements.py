"""Account statements as CSV."""

import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import Account, LedgerEntry
from app.services.currencies import MINOR_DIGITS
from app.services.errors import DomainError
from app.services.history import counterparty_name, history_query

MAX_ROWS = 5000
BOM = "﻿"  # makes Excel read the file as UTF-8, so Cyrillic and accents display correctly
_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def safe_text(value: str | None) -> str:
    """Neutralise CSV/formula injection in TEXT cells.

    Spreadsheet apps run a cell as a formula if it starts with = + - @ (or a tab/CR). A payment
    description or a counterparty's name is chosen by someone else, so we prefix such cells with
    a quote, which makes the spreadsheet show them as plain text. Never use this on numbers.
    """
    value = value or ""
    return "'" + value if value.startswith(_FORMULA_STARTS) else value


def decimal(amount: int, currency: str = "USD") -> str:
    """Integer minor units -> "-12.50" (or "-12500" for rials). Integer arithmetic only: no floats, no rounding surprises."""
    sign = "-" if amount < 0 else ""
    digits = MINOR_DIGITS.get(currency, 2)
    if digits == 0:
        return f"{sign}{abs(amount)}"
    whole, rest = divmod(abs(amount), 10**digits)
    return f"{sign}{whole}.{rest:0{digits}d}"


class StatementTooLong(DomainError):
    status_code = 422
    code = "statement_too_long"


def statement_csv(db: Session, account: Account, start: date | None, end: date | None) -> str:
    """Oldest first, like a paper statement. Dates are inclusive and in UTC."""
    if start and end and start > end:
        raise DomainError("The start date must not be after the end date.", code="bad_date_range")

    query = history_query(account.id).order_by(LedgerEntry.id)
    if start:
        query = query.where(LedgerEntry.created_at >= datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:  # inclusive: everything before the START of the next day
        query = query.where(LedgerEntry.created_at < datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc))

    rows = db.execute(query.limit(MAX_ROWS + 1)).all()
    if len(rows) > MAX_ROWS:
        raise StatementTooLong(f"That is more than {MAX_ROWS} lines. Choose a shorter date range.", params={"max": MAX_ROWS})

    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")  # the csv module does all quoting/escaping
    writer.writerow(["Date (UTC)", "Description", "Counterparty", f"Amount ({account.currency})", f"Balance after ({account.currency})", "Reference"])
    for entry, description, number, full_name in rows:
        writer.writerow(
            [
                entry.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                safe_text(description),
                safe_text(counterparty_name(full_name, number)),
                decimal(entry.amount, account.currency),  # numbers are NOT passed through safe_text
                decimal(entry.balance_after, account.currency),
                str(entry.transfer_id),
            ]
        )
    return BOM + out.getvalue()
