"""Finding who a payment is going to. Every path returns (owner, receiving account) or None."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountStatus, AccountType, User


def find_by_phone(db: Session, e164: str) -> tuple[User, Account] | None:
    """Phone payments land in the owner's DEFAULT account, and only if it is active."""
    row = db.execute(
        select(User, Account)
        .join(Account, Account.user_id == User.id)
        .where(
            User.phone == e164,
            User.is_active,
            Account.is_default,
            Account.status == AccountStatus.ACTIVE.value,
        )
    ).first()
    return (row[0], row[1]) if row else None


def find_by_account_number(db: Session, number: str) -> tuple[User, Account] | None:
    row = db.execute(
        select(User, Account)
        .join(Account, Account.user_id == User.id)
        .where(
            Account.account_number == number,
            Account.type != AccountType.SYSTEM.value,
            User.is_active,
        )
    ).first()
    return (row[0], row[1]) if row else None


def find_many_by_phone(db: Session, e164s: list[str]) -> dict[str, User]:
    """One query for a whole address book. Returns {e164: user} for customers who can receive."""
    if not e164s:
        return {}
    rows = db.execute(
        select(User)
        .join(Account, Account.user_id == User.id)
        .where(
            User.phone.in_(e164s),
            User.is_active,
            Account.is_default,
            Account.status == AccountStatus.ACTIVE.value,
        )
    ).scalars()
    return {u.phone: u for u in rows if u.phone}
