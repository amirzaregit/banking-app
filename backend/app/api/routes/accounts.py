import uuid

from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import Account, AccountType, LedgerEntry, User
from app.schemas.extras import TopUpRequest
from app.schemas.banking import (
    AccountResponse,
    DepositRequest,
    OpenAccountRequest,
    TransactionPage,
    TransactionResponse,
)
from app.services import accounts as account_service
from app.services import ledger, statements
from app.services.currencies import MAX_DEMO_DEPOSIT

# about $10,000 per top-up, in each currency (minor units)
MAX_TOPUP = {c: v * 10 for c, v in MAX_DEMO_DEPOSIT.items()}
from app.services.errors import DomainError, NotFound
from app.services.history import counterparty_name, history_query

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _to_response(account: Account, balance: int) -> AccountResponse:
    return AccountResponse(
        id=account.id,
        type=account.type,
        account_number=account.account_number,
        currency=account.currency,
        status=account.status,
        is_default=account.is_default,
        balance=balance,
        created_at=account.created_at,
    )


def get_owned_account(db: Session, user: User, account_id: uuid.UUID) -> Account:
    """404 (not 403) for other people's accounts: don't reveal that they exist."""
    account = db.scalar(select(Account).where(Account.id == account_id, Account.user_id == user.id))
    if account is None:
        raise NotFound("Account not found", code="account_not_found")
    return account


@router.get("", response_model=list[AccountResponse])
def list_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The customer's accounts with their balances (balances are derived from the ledger)."""
    accounts = db.scalars(
        select(Account).where(Account.user_id == user.id).order_by(Account.created_at)
    ).all()
    balances = ledger.get_balances(db, [a.id for a in accounts])
    return [_to_response(a, balances[a.id]) for a in accounts]


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def open_account(
    body: OpenAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Open another account in USD, RUB or IRR (up to eight accounts per customer)."""
    if account_service.count_user_accounts(db, user.id) >= account_service.MAX_ACCOUNTS_PER_USER:
        raise DomainError("Account limit reached", code="account_limit", params={"max": account_service.MAX_ACCOUNTS_PER_USER}, status_code=422)
    account = account_service.open_account(db, user.id, AccountType(body.type), body.currency)
    db.commit()
    return _to_response(account, 0)


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """One account and its balance. Other people's accounts answer 404, so their existence is not revealed."""
    account = get_owned_account(db, user, account_id)
    return _to_response(account, ledger.get_balance(db, account.id))


@router.put("/{account_id}/default", response_model=AccountResponse)
def set_default_account(
    account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Choose which account receives payments sent to your phone number."""
    account = get_owned_account(db, user, account_id)
    if account.status != "active":
        raise DomainError("Only an active account can receive payments", code="account_not_active", status_code=422)
    # Un-default the old one FIRST, so the "one default per user" index is never violated.
    db.execute(update(Account).where(Account.user_id == user.id, Account.is_default).values(is_default=False))
    account.is_default = True
    try:
        db.commit()
    except IntegrityError:  # two simultaneous requests: the index caught it
        db.rollback()
        raise DomainError("Please try again", code="conflict", status_code=409) from None
    return _to_response(account, ledger.get_balance(db, account.id))


@router.post("/{account_id}/deposit", response_model=AccountResponse)
def demo_deposit(
    account_id: uuid.UUID,
    body: DepositRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEMO ONLY: add fake money. A real bank would have no such endpoint."""
    if not settings.demo_mode:
        raise NotFound("Not found", code="not_found")
    account = get_owned_account(db, user, account_id)
    if body.amount > MAX_DEMO_DEPOSIT[account.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)
    ledger.deposit(db, account_id=account.id, amount=body.amount, description="Demo deposit")
    db.commit()
    return _to_response(account, ledger.get_balance(db, account.id))


@router.post("/{account_id}/topup", response_model=AccountResponse)
def demo_topup(
    account_id: uuid.UUID,
    body: TopUpRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEMO ONLY: top up an account as if the money came from a card, a bank transfer or cash. (In real life the money
    arrives from outside, and this endpoint would not exist.)"""
    if not settings.demo_mode:
        raise NotFound("Not found", code="not_found")
    account = get_owned_account(db, user, account_id)
    if body.amount > MAX_TOPUP[account.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)
    ledger.deposit(db, account_id=account.id, amount=body.amount, description=f"Top-up ({body.method})")
    db.commit()
    return _to_response(account, ledger.get_balance(db, account.id))


@router.get("/{account_id}/transactions", response_model=TransactionPage)
def transactions(
    account_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    before: int | None = Query(None, description="Cursor: only entries with id < before"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """An account's ledger lines, newest first, with cursor pagination."""
    account = get_owned_account(db, user, account_id)

    stmt = history_query(account.id).order_by(LedgerEntry.id.desc()).limit(limit)
    if before is not None:
        stmt = stmt.where(LedgerEntry.id < before)

    rows = db.execute(stmt).all()
    items = [
        TransactionResponse(
            id=entry.id,
            transfer_id=entry.transfer_id,
            amount=entry.amount,
            balance_after=entry.balance_after,
            description=description,
            counterparty_name=counterparty_name(full_name, number),
            counterparty_account_number=number,
            created_at=entry.created_at,
        )
        for entry, description, number, full_name in rows
    ]
    next_cursor = items[-1].id if len(items) == limit else None
    return TransactionPage(items=items, next_cursor=next_cursor)


@router.get("/{account_id}/statement.csv")
def statement(
    account_id: uuid.UUID,
    date_from: date | None = Query(None, alias="from", description="First day, YYYY-MM-DD (inclusive, UTC)"),
    date_to: date | None = Query(None, alias="to", description="Last day, YYYY-MM-DD (inclusive, UTC)"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The account's statement as a CSV file (opens in Excel, Numbers, Google Sheets)."""
    account = get_owned_account(db, user, account_id)
    content = statements.statement_csv(db, account, date_from, date_to)
    filename = f"statement-{account.account_number[-4:]}-{date_from or 'start'}_{date_to or 'today'}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
