import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import Account, Card, User
from app.schemas.history import CurrencyTotals, HistoryItem, HistoryPage, HistoryTotals
from app.services.errors import DomainError, NotFound
from app.services.history import counterparty_name, user_history

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=HistoryPage)
def history(
    account_id: uuid.UUID | None = Query(None, description="Only this account"),
    card_id: uuid.UUID | None = Query(None, description="Only payments made with this card"),
    date_from: date | None = Query(None, alias="from", description="First day, YYYY-MM-DD (inclusive, UTC)"),
    date_to: date | None = Query(None, alias="to", description="Last day, YYYY-MM-DD (inclusive, UTC)"),
    flow: Literal["in", "out"] | None = Query(None, description="Only money coming in, or only money going out"),
    limit: int = Query(30, ge=1, le=100),
    before: int | None = Query(None, description="Cursor: only lines with id < before"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every transaction on all of the user's accounts (newest first), with filters and totals."""
    if date_from and date_to and date_from > date_to:
        raise DomainError("The start date must not be after the end date.", code="bad_date_range")
    if account_id is not None:
        get_owned_account(db, user, account_id)  # 404 for someone else's account
    if card_id is not None:
        owned = db.scalar(select(Card.id).join(Account, Account.id == Card.account_id).where(Card.id == card_id, Account.user_id == user.id))
        if owned is None:
            raise NotFound("Card not found", code="card_not_found")

    rows, totals = user_history(db, user.id, account_id=account_id, card_id=card_id, start=date_from, end=date_to, flow=flow, before=before, limit=limit)
    items = [
        HistoryItem(
            id=entry.id,
            transfer_id=entry.transfer_id,
            amount=entry.amount,
            balance_after=entry.balance_after,
            description=description,
            counterparty_name=counterparty_name(full_name, number),
            counterparty_account_number=number,
            created_at=entry.created_at,
            account_id=own.id,
            account_type=own.type,
            account_number=own.account_number,
            currency=own.currency,
            card_id=card,
        )
        for entry, description, number, full_name, own, card in rows
    ]
    return HistoryPage(
        items=items,
        next_cursor=items[-1].id if len(items) == limit else None,
        totals=HistoryTotals(by_currency=[CurrencyTotals(currency=c.currency, income=c.income, spending=c.spending) for c in totals.by_currency], count=totals.count),
    )
