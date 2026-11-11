from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_language
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import User
from app.schemas.extras import BillRequest, BillResponse, ProviderResponse
from app.services import bills, ledger, pin as pin_service, stepup
from app.services.currencies import MAX_TRANSFER
from app.services.errors import AccountNotActive, DomainError

router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("/providers", response_model=list[ProviderResponse])
def providers(user: User = Depends(get_current_user)):
    """Everything a customer can pay: mobile operators, internet, utilities, taxes and fines, charities."""
    return [ProviderResponse(id=p.id, category=p.category, currency=p.currency, reference=p.reference, names=p.names) for p in bills.PROVIDERS]


@router.post("/pay", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
def pay_bill(
    body: BillRequest,
    idempotency_key: str = Header(min_length=8, max_length=64, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    lang: str = Depends(get_language),
):
    """Pay a mobile, internet, utility, tax or charity provider. Same step-up as a transfer: PIN, plus an SMS code for larger amounts."""
    provider = bills.BY_ID.get(body.provider_id)
    if provider is None:
        raise DomainError("Unknown provider", code="unknown_provider", status_code=422)
    source = get_owned_account(db, user, body.from_account_id)
    if source.currency != provider.currency:
        raise DomainError("This provider is paid in a different currency", code="currency_mismatch", status_code=422, params={"currency": provider.currency})
    if body.amount > MAX_TRANSFER[source.currency]:
        raise DomainError("That amount is above the limit", code="amount_too_large", status_code=422)
    reference = bills.clean_reference(provider, body.reference)
    services_account = ledger.get_services_account(db, source.currency)

    # A retry of a finished payment returns the original result and asks for nothing (it moves no money).
    replay = ledger.find_replay(
        db, initiated_by=user.id, idempotency_key=idempotency_key, from_account_id=source.id, to_account_id=services_account.id, amount=body.amount, currency=source.currency
    )
    if replay is not None:
        return _response(db, replay, provider, reference)

    pin_service.verify_pin(db, user, body.pin)
    consumed = stepup.require_code_for_large_amount(
        db,
        user,
        source=source,
        amount=body.amount,
        request_hash=ledger.request_hash(source.id, services_account.id, body.amount, source.currency),
        idempotency_key=idempotency_key,
        otp=body.otp,
        recipient=provider.names.get(lang, provider.names["en"]),
        lang=lang,
    )
    description = provider.names["en"] + (f" · {reference}" if reference else "")
    try:
        transfer = ledger.post_transfer(
            db,
            from_account_id=source.id,
            to_account_id=services_account.id,
            amount=body.amount,
            initiated_by=user.id,
            idempotency_key=idempotency_key,
            description=description,
            service_provider=provider.id,
        )
    except AccountNotActive:
        raise DomainError("The account is not active", code="account_not_active", status_code=422) from None
    if consumed is not None:
        db.delete(consumed)
    db.commit()
    return _response(db, transfer, provider, reference)


def _response(db: Session, transfer, provider: bills.Provider, reference: str) -> BillResponse:
    return BillResponse(
        id=transfer.id,
        provider_id=provider.id,
        provider_name=provider.names["en"],
        reference=reference,
        amount=transfer.amount,
        currency=transfer.currency,
        created_at=transfer.created_at,
        new_balance=ledger.get_balance(db, transfer.from_account_id),
    )
