import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, AccountStatus, Card, Transfer, User
from app.services import ledger
from app.services.errors import AccountNotActive, CardDeclined, DomainError, InsufficientFunds, NotFound

MAX_CARDS_PER_ACCOUNT = 3
CARD_LIFETIME_YEARS = 3


def create_card(db: Session, account: Account) -> Card:
    """Issue a virtual card. (Caller commits.)"""
    if account.status != AccountStatus.ACTIVE.value:
        raise DomainError("Only an active account can have a card", code="account_not_active")
    existing = db.scalar(select(func.count()).select_from(Card).where(Card.account_id == account.id)) or 0
    if existing >= MAX_CARDS_PER_ACCOUNT:
        raise DomainError(f"An account can have at most {MAX_CARDS_PER_ACCOUNT} cards", code="card_limit", params={"max": MAX_CARDS_PER_ACCOUNT})
    now = datetime.now(timezone.utc)
    card = Card(
        account_id=account.id,
        last4=f"{secrets.randbelow(10_000):04d}",  # only the last 4 digits are kept
        expiry_month=now.month,
        expiry_year=now.year + CARD_LIFETIME_YEARS,
    )
    db.add(card)
    db.flush()
    return card


def get_owned_card(db: Session, user: User, card_id: uuid.UUID) -> tuple[Card, Account]:
    """404 (not 403) for other people's cards: don't reveal that they exist."""
    row = db.execute(
        select(Card, Account).join(Account, Account.id == Card.account_id).where(Card.id == card_id, Account.user_id == user.id)
    ).first()
    if row is None:
        raise NotFound("Card not found", code="card_not_found")
    return row[0], row[1]


def authorize_purchase(db: Session, user: User, card: Card, account: Account, merchant: str, amount: int) -> Transfer:
    """What a card network would ask the bank: may this card pay this amount? Approve by moving
    the money to the merchants' settlement account; otherwise decline and write NOTHING."""
    if card.status == "blocked":
        raise CardDeclined("Declined: this card is blocked.", params={"reason": "blocked"})
    if card.status != "active":
        raise CardDeclined("Declined: this card is frozen.", params={"reason": "frozen"})
    merchants = ledger.get_merchant_account(db, account.currency)
    try:
        return ledger.post_transfer(
            db,
            from_account_id=account.id,
            to_account_id=merchants.id,
            amount=amount,
            initiated_by=user.id,
            description=f"{merchant} (card ••{card.last4})",
            card_id=card.id,
        )
    except InsufficientFunds:
        raise CardDeclined("Declined: insufficient funds.", params={"reason": "insufficient_funds"}) from None
    except AccountNotActive:
        raise CardDeclined("Declined: the account is not active.", params={"reason": "account_inactive"}) from None
