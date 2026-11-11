"""Account and card services: ordering a plastic card, and blocking an account or a card.

Blocking has two speeds. A ready-made reason ("my card was stolen") blocks immediately: waiting for a person
would be wrong when money is at risk. A free-text reason ("other") is read by a specialist first, so nothing
is blocked until they approve. Nothing here commits: the route does, once."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountStatus, BlockRequest, Card, CardOrder, User
from app.services import notifications, pin as pin_service
from app.services.errors import DomainError, NotFound

# Must match the branches in the app (frontend/src/branches/data.ts): the app shows them, the server only checks the id.
BRANCH_IDS = ("tverskaya", "arbat", "novyArbat", "leningradsky", "kutuzovsky", "prospektMira", "pyatnitskaya", "leninsky")

ACCOUNT_REASONS = ("fraud_suspected", "unauthorized_access", "not_using", "switching_bank", "other")
CARD_REASONS = ("lost", "stolen", "swallowed_by_atm", "damaged", "fraud_suspected", "other")
MIN_DETAILS = 10


def last4(account: Account) -> str:
    return account.account_number[-4:]


# ------------------------------------------------------------------------------------ physical card

def order_physical_card(db: Session, user: User, account: Account, *, theme: str, branch_id: str, notify_by: str) -> CardOrder:
    """Ask a branch to make a plastic card. One per account at a time; a second try says it is already being made."""
    if account.status != AccountStatus.ACTIVE.value:
        raise DomainError("Only an active account can have a card", code="account_not_active")
    if branch_id not in BRANCH_IDS:
        raise DomainError("Unknown branch", code="unknown_branch", status_code=422)
    if pending_order(db, account.id) is not None:
        raise DomainError("A card for this account is already being made", code="card_order_pending", status_code=409)
    order = CardOrder(user_id=user.id, account_id=account.id, theme=theme, branch_id=branch_id, notify_by=notify_by)
    db.add(order)
    db.flush()
    notifications.notify(
        db, user.id, "card_order_placed", "Your card is being made",
        "We will tell you in the app when it is ready to collect.",
        params={"last4": last4(account), "branch_id": branch_id, "notify_by": notify_by},
    )
    return order


def pending_order(db: Session, account_id: uuid.UUID) -> CardOrder | None:
    return db.scalar(select(CardOrder).where(CardOrder.account_id == account_id, CardOrder.status == "pending"))


def get_owned_order(db: Session, user: User, order_id: uuid.UUID) -> CardOrder:
    order = db.scalar(select(CardOrder).where(CardOrder.id == order_id, CardOrder.user_id == user.id))
    if order is None:
        raise NotFound("Order not found", code="card_order_not_found")
    return order


def mark_order_ready(db: Session, user: User, order: CardOrder, account: Account) -> None:
    """DEMO: the branch finished the card."""
    if order.status == "ready":
        return
    order.status = "ready"
    notifications.notify(
        db, user.id, "card_order_ready", "Your card is ready",
        "Collect it at the branch you chose.",
        params={"last4": last4(account), "branch_id": order.branch_id},
    )


# ------------------------------------------------------------------------------------ blocking

def _check_reason(reason: str, allowed: tuple[str, ...], details: str | None) -> str | None:
    if reason not in allowed:
        raise DomainError("Unknown reason", code="unknown_reason", status_code=422)
    text = (details or "").strip() or None
    if reason == "other" and (text is None or len(text) < MIN_DETAILS):
        raise DomainError("Please describe the reason", code="details_required", params={"min": MIN_DETAILS}, status_code=422)
    return text if reason == "other" else None  # details only matter for the free-text reason


def _open_review(db: Session, *, account_id: uuid.UUID, card_id: uuid.UUID | None) -> bool:
    stmt = select(BlockRequest.id).where(BlockRequest.status == "pending_review")
    stmt = stmt.where(BlockRequest.card_id == card_id) if card_id else stmt.where(BlockRequest.account_id == account_id, BlockRequest.target == "account")
    return db.scalar(stmt) is not None


def block_account(db: Session, user: User, account: Account, *, reason: str, details: str | None) -> BlockRequest:
    text = _check_reason(reason, ACCOUNT_REASONS, details)
    if account.status == AccountStatus.CLOSED.value:
        raise DomainError("Only an active account can be blocked", code="account_not_active")
    if account.status == AccountStatus.FROZEN.value:
        raise DomainError("This account is already blocked", code="already_blocked", status_code=409)
    if _open_review(db, account_id=account.id, card_id=None):
        raise DomainError("A request for this account is waiting for a specialist", code="block_pending", status_code=409)
    req = BlockRequest(user_id=user.id, account_id=account.id, target="account", reason=reason, details=text,
                       status="pending_review" if reason == "other" else "applied")
    db.add(req)
    db.flush()
    if req.status == "applied":
        _apply(db, user, account, None, req)
    else:
        notifications.notify(db, user.id, "block_requested", "Block request received", "A specialist will review it.",
                             params={"target": "account", "last4": last4(account)})
    return req


def block_card(db: Session, user: User, card: Card, account: Account, *, reason: str, details: str | None) -> BlockRequest:
    text = _check_reason(reason, CARD_REASONS, details)
    if card.status == "blocked":
        raise DomainError("This card is already blocked", code="already_blocked", status_code=409)
    if _open_review(db, account_id=account.id, card_id=card.id):
        raise DomainError("A request for this card is waiting for a specialist", code="block_pending", status_code=409)
    req = BlockRequest(user_id=user.id, account_id=account.id, card_id=card.id, target="card", reason=reason, details=text,
                       status="pending_review" if reason == "other" else "applied")
    db.add(req)
    db.flush()
    if req.status == "applied":
        _apply(db, user, account, card, req)
    else:
        notifications.notify(db, user.id, "block_requested", "Block request received", "A specialist will review it.",
                             params={"target": "card", "last4": card.last4})
    return req


def _apply(db: Session, user: User, account: Account, card: Card | None, req: BlockRequest) -> None:
    if card is None:
        account.status = AccountStatus.FROZEN.value
        notifications.notify(db, user.id, "account_blocked", "Account blocked", "Payments from and to it are stopped until you unblock it.",
                             params={"last4": last4(account), "reason": req.reason})
    else:
        card.status = "blocked"
        notifications.notify(db, user.id, "card_blocked", f"Card ••{card.last4} blocked", "It can no longer be used. Order a new one if you need it.",
                             params={"last4": card.last4, "reason": req.reason})


def unblock_account(db: Session, user: User, account: Account, pin: str) -> None:
    """Undo a block on an ACCOUNT. Asks for the payment PIN: unblocking is the dangerous direction."""
    if account.status != AccountStatus.FROZEN.value:
        raise DomainError("This account is not blocked", code="not_blocked", status_code=409)
    pin_service.verify_pin(db, user, pin)
    account.status = AccountStatus.ACTIVE.value
    notifications.notify(db, user.id, "account_unblocked", "Account unblocked", "It works again.", params={"last4": last4(account)})


def get_owned_request(db: Session, user: User, request_id: uuid.UUID) -> BlockRequest:
    req = db.scalar(select(BlockRequest).where(BlockRequest.id == request_id, BlockRequest.user_id == user.id))
    if req is None:
        raise NotFound("Request not found", code="block_request_not_found")
    return req


def review(db: Session, user: User, req: BlockRequest, *, approve: bool) -> None:
    """DEMO: what the specialist does. Approving blocks the account or card; rejecting leaves it as it was."""
    if req.status != "pending_review":
        raise DomainError("This request was already reviewed", code="already_reviewed", status_code=409)
    req.resolved_at = datetime.now(timezone.utc)
    account = db.get(Account, req.account_id)
    card = db.get(Card, req.card_id) if req.card_id else None
    if approve:
        req.status = "approved"
        _apply(db, user, account, card, req)
    else:
        req.status = "rejected"
        notifications.notify(db, user.id, "block_rejected", "Block request declined", "Nothing was blocked. Contact support if you disagree.",
                             params={"target": req.target, "last4": card.last4 if card else last4(account)})
