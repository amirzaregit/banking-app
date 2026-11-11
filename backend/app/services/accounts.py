import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Account, AccountType

MAX_ACCOUNTS_PER_USER = 8


def _new_account_number() -> str:
    return f"{secrets.randbelow(10**10):010d}"


def open_account(db: Session, user_id: uuid.UUID, type_: AccountType, currency: str = "USD") -> Account:
    """Create an account with a random unique number.

    Each attempt runs in a SAVEPOINT (begin_nested) so a number collision only
    undoes that one insert, not the caller's whole transaction.
    """
    # A customer's first account becomes their default receiving account.
    is_first = count_user_accounts(db, user_id) == 0
    for _ in range(5):
        account = Account(
            user_id=user_id,
            type=type_.value,
            currency=currency,
            account_number=_new_account_number(),
            is_default=is_first,
        )
        try:
            with db.begin_nested():
                db.add(account)
            return account
        except IntegrityError:
            continue
    raise RuntimeError("Could not allocate a unique account number")


def count_user_accounts(db: Session, user_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(Account).where(Account.user_id == user_id)) or 0
