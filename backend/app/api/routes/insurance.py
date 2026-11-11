import uuid

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_language
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import Account, InsurancePolicy, User
from app.schemas.insurance import InsuranceDetails, PolicyResponse, PurchaseRequest, QuoteRequest, QuoteResponse
from app.services import insurance as service
from app.services import ledger, notifications, pin as pin_service, rates as rates_service, stepup
from app.services.errors import AccountNotActive, DomainError

router = APIRouter(prefix="/insurance", tags=["insurance"])


def _quote(body: InsuranceDetails, currency: str) -> service.Quote:
    snapshot, _ = rates_service.get_rates()
    return service.quote(
        rates=snapshot.rates, product=body.product, plan=body.plan, currency=currency, start_date=body.start_date, end_date=body.end_date,
        region=body.region, travelers=body.travelers, months=body.months, plate=body.plate, address=body.address,
    )


def _response(db: Session, policy: InsurancePolicy, *, with_balance: bool = False) -> PolicyResponse:
    account = db.get(Account, policy.account_id)
    return PolicyResponse(
        id=policy.id, policy_number=policy.policy_number, product=policy.product, plan=policy.plan, holder_name=policy.holder_name,
        premium=policy.premium, coverage=policy.coverage, currency=policy.currency, start_date=policy.start_date, end_date=policy.end_date,
        status=service.status_of(policy), details=policy.details, account_number=account.account_number, created_at=policy.created_at,
        new_balance=ledger.get_balance(db, account.id) if with_balance else None,
    )


@router.post("/quote", response_model=QuoteResponse)
def get_quote(body: QuoteRequest, user: User = Depends(get_current_user)):
    """The price and the cover limit for the chosen details, in the chosen currency. Nothing is bought or stored."""
    q = _quote(body, body.currency)
    return QuoteResponse(premium=q.premium, coverage=q.coverage, currency=q.currency, start_date=q.start_date, end_date=q.end_date)


@router.post("/policies", response_model=PolicyResponse, status_code=status.HTTP_201_CREATED)
def buy(
    body: PurchaseRequest,
    idempotency_key: str = Header(min_length=8, max_length=64, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    lang: str = Depends(get_language),
):
    """Buy a policy and pay for it from one of your accounts, in that account's currency. The certificate is issued in the
    account holder's name. Same step-up as a transfer: PIN, plus an SMS code for larger amounts. A retried request returns
    the same policy and charges nothing. Send `expected_premium` (the price you showed): if the exchange rate has moved so the price
    differs, nothing is charged and the answer is 409 `price_changed` with the new price."""
    source = get_owned_account(db, user, body.account_id)
    finished = service.find_by_key(db, user, idempotency_key, source.id)
    if finished is not None:  # a retry of a purchase that already went through: same policy, nothing charged, nothing asked
        return _response(db, finished, with_balance=True)
    q = _quote(body, source.currency)
    services_account = ledger.get_services_account(db, source.currency)

    replay = ledger.find_replay(
        db, initiated_by=user.id, idempotency_key=idempotency_key, from_account_id=source.id, to_account_id=services_account.id, amount=q.premium, currency=source.currency
    )
    if replay is not None:
        existing = service.for_transfer(db, replay.id)
        if existing is not None:
            return _response(db, existing, with_balance=True)

    if body.expected_premium is not None and body.expected_premium != q.premium:
        raise DomainError("The price has changed. Check the new price and confirm again.", code="price_changed", params={"premium": q.premium}, status_code=409)
    pin_service.verify_pin(db, user, body.pin)
    consumed = stepup.require_code_for_large_amount(
        db, user, source=source, amount=q.premium,
        request_hash=ledger.request_hash(source.id, services_account.id, q.premium, source.currency),
        idempotency_key=idempotency_key, otp=body.otp, recipient="Insurance", lang=lang,
    )
    number = service.new_policy_number(body.product)
    try:
        transfer = ledger.post_transfer(
            db, from_account_id=source.id, to_account_id=services_account.id, amount=q.premium, initiated_by=user.id,
            idempotency_key=idempotency_key, description=f"Insurance {number}", service_provider=f"insurance_{body.product}",
        )
    except AccountNotActive:
        raise DomainError("The account is not active", code="account_not_active", status_code=422) from None
    policy = service.create_policy(db, user, source, product=body.product, plan=body.plan, q=q, number=number, transfer_id=transfer.id)
    if consumed is not None:
        db.delete(consumed)
    notifications.notify(
        db, user.id, "insurance_bought", "Insurance bought", f"Policy {number} is active from {q.start_date}.",
        params={"product": body.product, "policy_number": number},
    )
    db.commit()
    return _response(db, policy, with_balance=True)


@router.get("/policies", response_model=list[PolicyResponse])
def list_policies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Your policies, newest first."""
    return [_response(db, p) for p in service.list_policies(db, user)]


@router.get("/policies/{policy_id}", response_model=PolicyResponse)
def get_policy(policy_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One policy with everything printed on its certificate."""
    return _response(db, service.get_policy(db, user, policy_id))
