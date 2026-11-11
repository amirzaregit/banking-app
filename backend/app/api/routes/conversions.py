import uuid

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_language, rate_limited
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import Account, Transfer, User
from app.schemas.conversion import ConversionRequest, ConversionResponse, QuoteResponse
from app.services import conversion, ledger, pin as pin_service, rates as rates_service, stepup
from app.services.currencies import MAX_TRANSFER
from app.services.errors import DomainError

router = APIRouter(prefix="/conversions", tags=["conversions"])


def _checked_pair(db: Session, user: User, from_id: uuid.UUID, to_id: uuid.UUID, amount: int) -> tuple[Account, Account]:
    source = get_owned_account(db, user, from_id)
    dest = get_owned_account(db, user, to_id)  # only YOUR accounts: conversion is a move between your own pots
    if source.id == dest.id:
        raise DomainError("Cannot convert to the same account", code="same_account", status_code=422)
    if source.currency == dest.currency:
        raise DomainError("Both accounts hold the same currency: send a normal transfer instead", code="same_currency", status_code=422)
    if amount > MAX_TRANSFER[source.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)
    return source, dest


def _response(db: Session, first: Transfer, second: Transfer) -> ConversionResponse:
    return ConversionResponse(
        id=first.conversion_id,
        from_account_id=first.from_account_id,
        to_account_id=second.to_account_id,
        from_currency=first.currency,
        to_currency=second.currency,
        amount=first.amount,
        to_amount=second.amount,
        rate=float(first.fx_rate),
        created_at=first.created_at,
        from_balance=ledger.get_balance(db, first.from_account_id),
        to_balance=ledger.get_balance(db, second.to_account_id),
    )


@router.get("/quote", response_model=QuoteResponse, dependencies=[Depends(rate_limited("quote", limit=60, window_seconds=60))])
def get_quote(
    from_account_id: uuid.UUID,
    to_account_id: uuid.UUID,
    amount: int = Query(gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What would this conversion give me right now? Moves nothing."""
    source, dest = _checked_pair(db, user, from_account_id, to_account_id, amount)
    snapshot, stale = rates_service.get_rates()
    to_amount, rate = conversion.quote(snapshot.rates, source.currency, dest.currency, amount)
    return QuoteResponse(
        from_currency=source.currency,
        to_currency=dest.currency,
        amount=amount,
        to_amount=to_amount,
        rate=float(rate),
        rates_updated_at=snapshot.updated_at,
        stale=stale,
    )


@router.post("", response_model=ConversionResponse, status_code=status.HTTP_201_CREATED)
def create_conversion(
    body: ConversionRequest,
    idempotency_key: str = Header(min_length=8, max_length=64, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    lang: str = Depends(get_language),
):
    """Convert money between two of the customer's own accounts in different currencies, at the rate they were shown. PIN, plus an SMS code for larger amounts."""
    source, dest = _checked_pair(db, user, body.from_account_id, body.to_account_id, body.amount)

    # A retry of a finished conversion returns the original result and asks for nothing (it moves no money).
    replay = ledger.find_replay(
        db,
        initiated_by=user.id,
        idempotency_key=idempotency_key,
        from_account_id=source.id,
        to_account_id=ledger.get_fx_account(db, source.currency).id,
        amount=body.amount,
        currency=source.currency,
    )
    if replay is not None:
        return _response(db, replay, conversion.second_leg(db, replay))

    pin_service.verify_pin(db, user, body.pin)

    snapshot, _stale = rates_service.get_rates()
    to_amount, rate = conversion.quote(snapshot.rates, source.currency, dest.currency, body.amount)
    if to_amount != body.expected_to_amount:
        # The rate moved since the user looked: never convert at a number they did not see.
        raise DomainError("The rate changed. Check the new amount and confirm again.", code="rate_changed", status_code=409, params={"to_amount": to_amount, "to_currency": dest.currency})

    consumed = stepup.require_code_for_large_amount(
        db,
        user,
        source=source,
        amount=body.amount,
        request_hash=ledger.request_hash(source.id, dest.id, body.amount, source.currency),
        idempotency_key=idempotency_key,
        otp=body.otp,
        recipient=f"{dest.currency} ••{dest.account_number[-4:]}",
        lang=lang,
    )

    first, second = conversion.convert(
        db, user_id=user.id, source=source, dest=dest, amount=body.amount, to_amount=to_amount, rate=rate, idempotency_key=idempotency_key
    )
    if consumed is not None:
        db.delete(consumed)  # single-use, removed in the same transaction as the money
    db.commit()
    return _response(db, first, second)
