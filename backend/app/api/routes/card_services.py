import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.accounts import get_owned_account
from app.core.config import settings
from app.db.session import get_db
from app.models import Account, BlockRequest, CardOrder, User
from app.schemas.card_services import BlockCreate, BlockRequestResponse, CardOrderCreate, CardOrderResponse, ReviewRequest, UnblockRequest
from app.services import card_services as service
from app.services import cards as card_service
from app.services.errors import NotFound

router = APIRouter(tags=["card services"])


def _order(o: CardOrder) -> CardOrderResponse:
    return CardOrderResponse(id=o.id, account_id=o.account_id, theme=o.theme, branch_id=o.branch_id, notify_by=o.notify_by, status=o.status, created_at=o.created_at)


def _block(r: BlockRequest) -> BlockRequestResponse:
    return BlockRequestResponse(id=r.id, account_id=r.account_id, card_id=r.card_id, target=r.target, reason=r.reason, details=r.details, status=r.status, created_at=r.created_at)


@router.get("/accounts/{account_id}/card-orders", response_model=list[CardOrderResponse])
def list_card_orders(account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Plastic-card orders for this account, newest first. A `pending` one means a card is being made."""
    account = get_owned_account(db, user, account_id)
    return [_order(o) for o in db.scalars(select(CardOrder).where(CardOrder.account_id == account.id).order_by(CardOrder.created_at.desc()))]


@router.post("/accounts/{account_id}/card-orders", response_model=CardOrderResponse, status_code=status.HTTP_201_CREATED)
def order_card(account_id: uuid.UUID, body: CardOrderCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Order a plastic card: a design (light or dark), a branch to collect it from, and how to be told when it is ready.
    Only one order per account can be in production at a time (409 `card_order_pending`)."""
    account = get_owned_account(db, user, account_id)
    order = service.order_physical_card(db, user, account, theme=body.theme, branch_id=body.branch_id, notify_by=body.notify_by)
    db.commit()
    return _order(order)


@router.post("/card-orders/{order_id}/demo-ready", response_model=CardOrderResponse)
def demo_order_ready(order_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """DEMO ONLY: pretend the branch finished the card."""
    if not settings.demo_mode:
        raise NotFound("Not found", code="not_found")
    order = service.get_owned_order(db, user, order_id)
    service.mark_order_ready(db, user, order, db.get(Account, order.account_id))
    db.commit()
    return _order(order)


@router.get("/accounts/{account_id}/block-requests", response_model=list[BlockRequestResponse])
def list_block_requests(account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Block requests for this account and its cards, newest first (so the app can show one waiting for a specialist)."""
    account = get_owned_account(db, user, account_id)
    return [_block(r) for r in db.scalars(select(BlockRequest).where(BlockRequest.account_id == account.id).order_by(BlockRequest.created_at.desc()))]


@router.post("/accounts/{account_id}/block", response_model=BlockRequestResponse, status_code=status.HTTP_201_CREATED)
def block_account(account_id: uuid.UUID, body: BlockCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Block an account. A ready-made `reason` blocks at once; `other` (with `details`) waits for a specialist (`pending_review`)."""
    account = get_owned_account(db, user, account_id)
    req = service.block_account(db, user, account, reason=body.reason, details=body.details)
    db.commit()
    return _block(req)


@router.post("/accounts/{account_id}/unblock", status_code=status.HTTP_204_NO_CONTENT)
def unblock_account(account_id: uuid.UUID, body: UnblockRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unblock an account you blocked. Needs the payment PIN."""
    account = get_owned_account(db, user, account_id)
    service.unblock_account(db, user, account, body.pin)
    db.commit()
    return None


@router.post("/cards/{card_id}/block", response_model=BlockRequestResponse, status_code=status.HTTP_201_CREATED)
def block_card(card_id: uuid.UUID, body: BlockCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Block a card for good (lost, stolen, damaged ...). Unlike freezing this cannot be undone: order a new card.
    `other` (with `details`) waits for a specialist."""
    card, account = card_service.get_owned_card(db, user, card_id)
    req = service.block_card(db, user, card, account, reason=body.reason, details=body.details)
    db.commit()
    return _block(req)


@router.post("/block-requests/{request_id}/demo-review", response_model=BlockRequestResponse)
def demo_review(request_id: uuid.UUID, body: ReviewRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """DEMO ONLY: play the specialist: approve (the account/card gets blocked) or reject the request."""
    if not settings.demo_mode:
        raise NotFound("Not found", code="not_found")
    req = service.get_owned_request(db, user, request_id)
    service.review(db, user, req, approve=body.approve)
    db.commit()
    return _block(req)
