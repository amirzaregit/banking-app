from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.transactions import ExchangeInfo, TransactionDetail
from app.services import transactions as service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("/{entry_id}", response_model=TransactionDetail)
def get_transaction(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One line of your statement in full: what it was, the other side, the accounts, and everything a receipt prints.
    `entry_id` is the `id` of a history line. Someone else's line is a 404."""
    d = service.get_detail(db, user.id, entry_id)
    return TransactionDetail(
        id=d.entry.id, transfer_id=d.transfer.id, receipt_number=d.receipt_number, kind=d.kind, amount=d.entry.amount, currency=d.currency,
        balance_after=d.entry.balance_after, created_at=d.entry.created_at, status=d.transfer.status, description=d.transfer.description,
        counterparty_name=d.counterparty_name, counterparty_account_number=d.counterparty_account_number, account_id=d.account_id,
        account_type=d.account_type, account_number=d.account_number, card_last4=d.card_last4,
        provider_id=d.transfer.service_provider, gift_design=d.transfer.gift_design,
        exchange=ExchangeInfo(rate=float(d.exchange.rate), other_amount=d.exchange.other_amount, other_currency=d.exchange.other_currency) if d.exchange else None,
    )
