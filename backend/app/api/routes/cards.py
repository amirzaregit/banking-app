import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.accounts import get_owned_account
from app.core.config import settings
from app.db.session import get_db
from app.models import Account, Card, User
from app.schemas.cards import CardListItem, CardResponse, PurchaseRequest, PurchaseResponse
from app.services import cards as card_service
from app.services import notifications
from app.services.format import format_money
from app.services import ledger
from app.services.currencies import MAX_PURCHASE
from app.services.errors import DomainError, NotFound

router = APIRouter(tags=["cards"])


def _to_response(card: Card) -> CardResponse:
    return CardResponse(
        id=card.id,
        account_id=card.account_id,
        last4=card.last4,
        expiry=f"{card.expiry_month:02d}/{card.expiry_year % 100:02d}",
        status=card.status,
        created_at=card.created_at,
    )


@router.get("/cards", response_model=list[CardListItem])
def list_all_cards(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Every card on every account of the user."""
    rows = db.execute(
        select(Card, Account).join(Account, Account.id == Card.account_id).where(Account.user_id == user.id).order_by(Card.created_at)
    ).all()
    return [CardListItem(**_to_response(card).model_dump(), account_type=account.type, account_number=account.account_number) for card, account in rows]


@router.get("/accounts/{account_id}/cards", response_model=list[CardResponse])
def list_cards(account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The account's virtual cards."""
    account = get_owned_account(db, user, account_id)
    cards = db.scalars(select(Card).where(Card.account_id == account.id).order_by(Card.created_at)).all()
    return [_to_response(c) for c in cards]


@router.post("/accounts/{account_id}/cards", response_model=CardResponse, status_code=status.HTTP_201_CREATED)
def create_card(account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Issue a virtual card (at most three per account). Only the last four digits are stored."""
    account = get_owned_account(db, user, account_id)
    card = card_service.create_card(db, account)
    db.commit()
    return _to_response(card)


def _set_status(card_id: uuid.UUID, new_status: str, user: User, db: Session) -> CardResponse:
    card, _ = card_service.get_owned_card(db, user, card_id)
    if card.status == "blocked":
        raise DomainError("This card is blocked for good", code="card_blocked", status_code=409)
    if card.status != new_status:  # idempotent: re-freezing a frozen card changes nothing, says nothing
        card.status = new_status
        frozen = new_status == "frozen"
        notifications.notify(
            db,
            user.id,
            "card_frozen" if frozen else "card_unfrozen",
            f"Card ••{card.last4} {'frozen' if frozen else 'unfrozen'}",
            "Purchases will be declined until you unfreeze it." if frozen else "Purchases work again.",
            params={"last4": card.last4},
        )
    db.commit()
    return _to_response(card)


@router.post("/cards/{card_id}/freeze", response_model=CardResponse)
def freeze(card_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Freeze a card: purchases are declined until it is unfrozen."""
    return _set_status(card_id, "frozen", user, db)


@router.post("/cards/{card_id}/unfreeze", response_model=CardResponse)
def unfreeze(card_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unfreeze a card."""
    return _set_status(card_id, "active", user, db)


@router.post("/cards/{card_id}/purchase", response_model=PurchaseResponse)
def simulate_purchase(
    card_id: uuid.UUID,
    body: PurchaseRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEMO ONLY: pretend a shop charged this card. In real life the card NETWORK calls the bank,
    never the customer's own phone."""
    if not settings.demo_mode:
        raise NotFound("Not found", code="not_found")
    card, account = card_service.get_owned_card(db, user, card_id)
    if body.amount > MAX_PURCHASE[account.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)
    transfer = card_service.authorize_purchase(db, user, card, account, body.merchant.strip(), body.amount)
    notifications.notify(
        db,
        user.id,
        "card_purchase",
        "Card payment",
        f"{format_money(body.amount, account.currency)} at {body.merchant.strip()} (card ••{card.last4}).",
        dedupe_key=f"purchase:{transfer.id}",
        params={"amount": body.amount, "currency": account.currency, "merchant": body.merchant.strip(), "last4": card.last4},
    )
    db.commit()
    return PurchaseResponse(approved=True, transfer_id=transfer.id, new_balance=ledger.get_balance(db, account.id))
