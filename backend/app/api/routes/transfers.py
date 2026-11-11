from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_language
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import Transfer, User
from app.schemas.banking import TransferRequest, TransferResponse
from app.services import ledger, notifications, payment_requests, pin as pin_service, recipients, stepup
from app.services.currencies import MAX_TRANSFER
from app.services.errors import DomainError, NotFound
from app.services.format import format_money
from app.services.phone import mask_name, normalize_phone

router = APIRouter(prefix="/transfers", tags=["transfers"])


def _response(db: Session, transfer: Transfer, recipient_name: str) -> TransferResponse:
    return TransferResponse(
        id=transfer.id,
        from_account_id=transfer.from_account_id,
        recipient_name=recipient_name,
        amount=transfer.amount,
        currency=transfer.currency,
        status=transfer.status,
        description=transfer.description,
        created_at=transfer.created_at,
        gift_design=transfer.gift_design,
        new_balance=ledger.get_balance(db, transfer.from_account_id),
    )


@router.post("", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
def create_transfer(
    body: TransferRequest,
    idempotency_key: str = Header(min_length=8, max_length=64, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    lang: str = Depends(get_language),
):
    """Send money to a phone number or account number. Needs an Idempotency-Key and the payment PIN; larger amounts also need an SMS code."""
    source = get_owned_account(db, user, body.from_account_id)

    # The SERVER decides which account gets the money; the client only says who.
    if body.to_phone is not None:
        e164 = normalize_phone(body.to_phone)
        if e164 is None:
            raise DomainError("Enter a valid phone number", code="invalid_phone", status_code=422)
        found = recipients.find_by_phone(db, e164)
    else:
        found = recipients.find_by_account_number(db, body.to_account_number or "")
    if found is None:
        raise NotFound("Recipient not found", code="recipient_not_found")
    owner, dest = found
    recipient_name = mask_name(owner.full_name)

    # 1. Already done? A retry of a finished payment returns the original result and needs
    #    no PIN or code (it moves no money). This also keeps single-use codes retry-safe.
    replay = ledger.find_replay(
        db,
        initiated_by=user.id,
        idempotency_key=idempotency_key,
        from_account_id=source.id,
        to_account_id=dest.id,
        amount=body.amount,
        currency=source.currency,
    )
    if replay is not None:
        return _response(db, replay, recipient_name)

    # 1b. Money of different currencies cannot be sent straight to another account: say so BEFORE asking for a PIN or code.
    #     (Moving money between YOUR OWN accounts of different currencies is what "Exchange" is for.)
    if source.currency != dest.currency:
        raise DomainError("These accounts hold different currencies", code="currency_mismatch", status_code=422, params={"own": owner.id == user.id})
    if body.amount > MAX_TRANSFER[source.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)

    # 1c. Settling a payment request (a link or QR the recipient shared)? It must still be open and match the payment.
    pay_request = None
    if body.request_token:
        pay_request = payment_requests.get_by_token(db, payment_requests.token_from_text(body.request_token), lock=True)
        payment_requests.check_payable(pay_request, payer_id=user.id, dest_account_id=dest.id, amount=body.amount)

    # 2. Step-up: prove it's really the owner (wrong guesses are counted and lock the PIN).
    pin_service.verify_pin(db, user, body.pin)

    # 3. Enough money? Then, for larger payments, a one-time SMS code tied to THIS exact payment (we never ask for a code
    #    for a payment that cannot happen).
    consumed_challenge = stepup.require_code_for_large_amount(
        db,
        user,
        source=source,
        amount=body.amount,
        request_hash=ledger.request_hash(source.id, dest.id, body.amount, source.currency),
        idempotency_key=idempotency_key,
        otp=body.otp,
        recipient=recipient_name,
        lang=lang,
    )

    # 4. Move the money.
    transfer = ledger.post_transfer(
        db,
        from_account_id=source.id,
        to_account_id=dest.id,
        amount=body.amount,
        initiated_by=user.id,
        idempotency_key=idempotency_key,
        description=body.description,
        gift_design=body.gift_design,
        request_id=pay_request.id if pay_request else None,
    )
    if pay_request is not None:
        pay_request.status = "paid"
        pay_request.paid_at = datetime.now(timezone.utc)
        pay_request.paid_by = user.id
        notifications.notify(
            db,
            pay_request.user_id,
            "request_paid",
            "Payment request paid",
            f"{mask_name(user.full_name)} paid {format_money(transfer.amount, transfer.currency)}.",
            dedupe_key=f"request:{pay_request.id}",
            params={"payer": mask_name(user.full_name), "amount": transfer.amount, "currency": transfer.currency, "note": pay_request.note},
        )
    if consumed_challenge is not None:
        db.delete(consumed_challenge)  # single-use: removed in the SAME transaction as the payment
    if owner.id != user.id:  # moving money between your own accounts needs no notification
        note = f" “{transfer.description}”" if transfer.description else ""
        notifications.notify(
            db,
            owner.id,
            "payment_received",
            "Money received",
            f"{mask_name(user.full_name)} sent you {format_money(transfer.amount, transfer.currency)}.{note}",
            dedupe_key=f"transfer:{transfer.id}",  # a race or retry can never notify twice
            params={
                "sender": mask_name(user.full_name),
                "amount": transfer.amount,
                "currency": transfer.currency,
                "description": transfer.description,
                "gift_design": transfer.gift_design,
            },
        )
    db.commit()  # <- the ONLY place money becomes permanent (and its notification with it)
    return _response(db, transfer, recipient_name)
