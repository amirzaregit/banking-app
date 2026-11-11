"""Official letters ("certificates") a customer can ask the bank for: proof of an account, of a balance, of income...

`build` collects the facts from the ledger into a plain dict; `issue` stores that dict as a snapshot with a reference
number. The app turns the snapshot into a PDF (so the document can be in English, Russian or Persian).
"""

import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.models import Account, Certificate, LedgerEntry, Transfer, User
from app.services import ledger
from app.services.errors import DomainError
from app.services.history import counterparty_name, history_query, user_history

# type -> (needs an account, needs a period)
TYPES: dict[str, tuple[bool, bool]] = {
    "account_confirmation": (True, False),  # "this person holds this account with us"
    "balance": (True, False),  # the balance on a date
    "statement": (True, True),  # an official, stamped statement for a period
    "bank_details": (True, False),  # the account's payment details, for employers and landlords
    "income": (True, True),  # money received from outside, by month: proof of income
    "proof_of_funds": (True, False),  # balances over the last 90 days, for visas and embassies
    "relationship": (False, False),  # "has been our customer since ..."
    "no_debt": (False, False),  # "has no loans, credits or overdrafts with us"
}
CODES = {
    "account_confirmation": "AC", "balance": "BC", "statement": "ST", "bank_details": "BD",
    "income": "IN", "proof_of_funds": "PF", "relationship": "CR", "no_debt": "ND",
}
LANGUAGES = ("en", "ru", "fa")
MAX_STATEMENT_LINES = 150

# Fictional bank identity: printed on bank_details letters. (Not real codes.)
BANK = {"name": "Banking Demo", "bic": "044500999", "swift": "DEMORUMM", "correspondent_account": "30101810000000000999", "inn": "7700000000"}


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def balance_at(db: Session, account_id: uuid.UUID, moment: datetime) -> int:
    """The balance as it was at `moment`: balance_after of the last ledger row at or before it (0 before the first)."""
    value = db.scalar(
        select(LedgerEntry.balance_after)
        .where(LedgerEntry.account_id == account_id, LedgerEntry.created_at <= moment)
        .order_by(LedgerEntry.id.desc())
        .limit(1)
    )
    return int(value or 0)


def _account_block(db: Session, account: Account) -> dict:
    return {
        "number": account.account_number,
        "type": account.type,
        "currency": account.currency,
        "status": account.status,
        "opened_on": account.created_at.date().isoformat(),
        "balance": ledger.get_balance(db, account.id),
    }


def _external_income_by_month(db: Session, user: User, account: Account, start: date | None, end: date | None) -> list[tuple[str, int, int]]:
    """(month 'YYYY-MM', total received from OUTSIDE, how many payments). Moves between the customer's own accounts and
    currency exchanges are not income."""
    other = aliased(Account)
    stmt = (
        select(LedgerEntry.created_at, LedgerEntry.amount, other.user_id)
        .join(Transfer, Transfer.id == LedgerEntry.transfer_id)
        .join(other, other.id == (Transfer.from_account_id))
        .where(LedgerEntry.account_id == account.id, LedgerEntry.amount > 0, Transfer.conversion_id.is_(None))
    )
    if start:
        stmt = stmt.where(LedgerEntry.created_at >= _day_start(start))
    if end:
        stmt = stmt.where(LedgerEntry.created_at < _day_start(end + timedelta(days=1)))
    months: dict[str, list[int]] = {}
    for created, amount, other_user in db.execute(stmt).all():
        if other_user == user.id:  # the money came from the customer's own other account
            continue
        bucket = months.setdefault(created.strftime("%Y-%m"), [0, 0])
        bucket[0] += int(amount)
        bucket[1] += 1
    return [(m, v[0], v[1]) for m, v in sorted(months.items())]


def build(db: Session, user: User, type_: str, account: Account | None, start: date | None, end: date | None, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    data: dict = {"issued_on": today.isoformat(), "customer": {"full_name": user.full_name, "email": user.email, "since": user.created_at.date().isoformat()}}
    if account is not None:
        data["account"] = _account_block(db, account)

    if type_ == "bank_details":
        data["bank"] = BANK
    elif type_ == "statement":
        rows = db.execute(history_query(account.id).where(*_period(start, end)).order_by(LedgerEntry.id.asc())).all()
        _lines, totals = user_history(db, user.id, account_id=account.id, start=start, end=end, limit=1)
        cur = next((c for c in totals.by_currency if c.currency == account.currency), None)
        data["period"] = {"from": start.isoformat() if start else None, "to": end.isoformat() if end else None}
        data["totals"] = {"income": cur.income if cur else 0, "spending": cur.spending if cur else 0, "count": totals.count}
        data["truncated"] = len(rows) > MAX_STATEMENT_LINES
        data["lines"] = [
            {
                "date": entry.created_at.date().isoformat(),
                "description": description,
                "counterparty": counterparty_name(full_name, number),
                "counterparty_number": number,
                "amount": int(entry.amount),
                "balance_after": int(entry.balance_after),
            }
            for entry, description, number, full_name in rows[-MAX_STATEMENT_LINES:]
        ]
    elif type_ == "income":
        months = _external_income_by_month(db, user, account, start, end)
        data["period"] = {"from": start.isoformat() if start else None, "to": end.isoformat() if end else None}
        data["months"] = [{"month": m, "amount": a, "count": n} for m, a, n in months]
        data["total"] = sum(a for _m, a, _n in months)
        data["count"] = sum(n for _m, _a, n in months)
    elif type_ == "proof_of_funds":
        points = []
        for days_ago in (90, 60, 30, 0):
            moment = datetime.now(timezone.utc) - timedelta(days=days_ago)
            points.append({"date": (today - timedelta(days=days_ago)).isoformat(), "amount": balance_at(db, account.id, moment)})
        data["balances"] = points
        data["lowest"] = min(p["amount"] for p in points)
        data["average"] = int(Decimal(sum(p["amount"] for p in points)) / len(points))
    elif type_ == "relationship":
        mine = db.scalars(select(Account).where(Account.user_id == user.id).order_by(Account.created_at)).all()
        data["accounts"] = [{"number": a.account_number, "type": a.type, "currency": a.currency, "status": a.status} for a in mine]
    elif type_ == "no_debt":
        mine = db.scalars(select(Account).where(Account.user_id == user.id)).all()
        data["accounts_checked"] = len(mine)
        data["overdrawn"] = sum(1 for a in mine if ledger.get_balance(db, a.id) < 0)
    return data


def _period(start: date | None, end: date | None) -> list:
    conditions = []
    if start:
        conditions.append(LedgerEntry.created_at >= _day_start(start))
    if end:
        conditions.append(LedgerEntry.created_at < _day_start(end + timedelta(days=1)))
    return conditions


def issue(db: Session, user: User, type_: str, language: str, account: Account | None, start: date | None, end: date | None, keep: bool = False) -> tuple[Certificate, bool]:
    """Check the request, snapshot the facts and number the certificate. Returns (certificate, kept).

    By default the certificate is NOT stored: the customer saves the PDF on their own phone and the server keeps nothing.
    With `keep` it is stored (and listed under "My documents"), so the same document can be produced again later.
    Does not commit."""
    if type_ not in TYPES:
        raise DomainError("Unknown certificate type", code="unknown_certificate", status_code=422)
    if language not in LANGUAGES:
        raise DomainError("Unsupported language", code="unsupported_language", status_code=422)
    needs_account, needs_period = TYPES[type_]
    if needs_account and account is None:
        raise DomainError("Choose an account", code="account_required", status_code=422)
    if not needs_account:
        account = None
    if needs_period:
        if start is None and end is None:
            end = datetime.now(timezone.utc).date()
            start = end - timedelta(days=90)
        if start and end and start > end:
            raise DomainError("The start date must not be after the end date.", code="bad_date_range")
    else:
        start = end = None

    data = build(db, user, type_, account, start, end)

    def new_certificate() -> Certificate:
        year = datetime.now(timezone.utc).year
        return Certificate(
            id=uuid.uuid4(),
            user_id=user.id,
            account_id=account.id if account else None,
            type=type_,
            language=language,
            ref_number=f"{CODES[type_]}-{year}-{secrets.randbelow(10**8):08d}",
            period_from=start,
            period_to=end,
            data=data,
            issued_at=datetime.now(timezone.utc),
        )

    if not keep:
        return new_certificate(), False
    for _ in range(5):
        certificate = new_certificate()
        try:
            with db.begin_nested():
                db.add(certificate)
            return certificate, True
        except IntegrityError:
            continue
    raise RuntimeError("Could not allocate a unique reference number")
