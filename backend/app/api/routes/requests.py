import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, rate_limited
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import Account, PaymentRequest, User
from app.schemas.extras import PaymentRequestCreate, PaymentRequestLookup, PaymentRequestResponse
from app.services import payment_requests as service
from app.services.errors import NotFound
from app.services.phone import mask_name

router = APIRouter(prefix="/requests", tags=["payment requests"])


def _response(request: PaymentRequest, account_number: str) -> PaymentRequestResponse:
    return PaymentRequestResponse(
        id=request.id,
        token=request.token,
        link=service.link_for(request.token),
        amount=request.amount,
        currency=request.currency,
        note=request.note,
        status=service.effective_status(request),
        created_at=request.created_at,
        expires_at=request.expires_at,
        account_number=account_number,
    )


@router.post("", response_model=PaymentRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(body: PaymentRequestCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ask to be paid: returns a link (and its token, for a QR code) that anyone with the app can open."""
    account = get_owned_account(db, user, body.account_id)
    request = service.create(db, user, account, body.amount, body.note)
    db.commit()
    return _response(request, account.account_number)


@router.get("", response_model=list[PaymentRequestResponse])
def my_requests(limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The customer's payment requests, newest first (open, paid, cancelled or expired)."""
    rows = db.execute(
        select(PaymentRequest, Account.account_number)
        .join(Account, Account.id == PaymentRequest.account_id)
        .where(PaymentRequest.user_id == user.id)
        .order_by(PaymentRequest.created_at.desc())
        .limit(limit)
    ).all()
    return [_response(r, number) for r, number in rows]


@router.post("/{request_id}/cancel", response_model=PaymentRequestResponse)
def cancel_request(request_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cancel an open payment request so it can no longer be paid."""
    row = db.execute(
        select(PaymentRequest, Account.account_number)
        .join(Account, Account.id == PaymentRequest.account_id)
        .where(PaymentRequest.id == request_id, PaymentRequest.user_id == user.id)
        .with_for_update(of=PaymentRequest)
    ).first()
    if row is None:
        raise NotFound("Payment request not found", code="request_not_found")
    request, number = row
    if request.status == "open":
        request.status = "cancelled"
        db.commit()
    return _response(request, number)


@router.get("/lookup/{token}", response_model=PaymentRequestLookup, dependencies=[Depends(rate_limited("request_lookup", limit=30, window_seconds=60))])
def lookup_request(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Someone opened a payment link or scanned a code: what are they being asked to pay, and to whom (masked)?"""
    request = service.get_by_token(db, service.token_from_text(token))
    owner = db.get(User, request.user_id)
    account = db.get(Account, request.account_id)
    return PaymentRequestLookup(
        token=request.token,
        requester_name=mask_name(owner.full_name),
        amount=request.amount,
        currency=request.currency,
        note=request.note,
        status=service.effective_status(request),
        expires_at=request.expires_at,
        account_number=account.account_number,
        is_mine=request.user_id == user.id,
    )
