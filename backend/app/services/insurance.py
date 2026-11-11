"""Insurance the bank sells: travel, medical, car and home.

Prices are defined once, in US cents, and turned into the paying account's currency with a fixed demo factor (about the same
value as the one-time-code limits in `currencies.py`). Buying is an ordinary transfer from the customer's account to the bank's
per-currency "services" account, plus a policy row that freezes everything printed on the certificate, in the holder's name."""

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, InsurancePolicy, Transfer, User
from app.services.currencies import SUPPORTED
from app.services.errors import DomainError, NotFound
from app.services.pricing import price_in

PRODUCTS = ("travel", "medical", "car", "home")
PLANS: dict[str, tuple[str, ...]] = {
    "travel": ("basic", "standard", "premium"),
    "medical": ("basic", "standard", "premium"),
    "car": ("liability", "full"),
    "home": ("basic", "standard", "premium"),
}
CODES = {"travel": "TRV", "medical": "MED", "car": "CAR", "home": "HOM"}
REGIONS = {"cis": 80, "europe": 130, "asia": 110, "worldwide": 160}  # price multiplier in percent
MEDICAL_MONTHS = (1, 3, 6, 12)
CAR_MONTHS = (6, 12)
MAX_TRIP_DAYS = 90
MAX_TRAVELERS = 5
MAX_START_AHEAD_DAYS = 365

# Cover limit in US cents, per product and plan (what the certificate says the policy pays at most).
COVERAGE = {
    "travel": {"basic": 3_000_000, "standard": 5_000_000, "premium": 10_000_000},
    "medical": {"basic": 2_000_000, "standard": 5_000_000, "premium": 15_000_000},
    "car": {"liability": 4_000_000, "full": 8_000_000},
    "home": {"basic": 3_000_000, "standard": 6_000_000, "premium": 12_000_000},
}
TRAVEL_PER_DAY = {"basic": 150, "standard": 250, "premium": 400}  # US cents per person per day
MEDICAL_PER_MONTH = {"basic": 1_200, "standard": 2_500, "premium": 4_500}
CAR_PRICE = {"liability": {6: 3_500, 12: 6_000}, "full": {6: 14_000, 12: 25_000}}
HOME_PER_YEAR = {"basic": 3_000, "standard": 6_000, "premium": 10_000}


@dataclass(frozen=True)
class Quote:
    premium: int  # minor units of `currency`
    coverage: int
    currency: str
    start_date: date
    end_date: date
    details: dict  # what the certificate lists besides the plan: region, travelers, plate, address, months


def add_months(start: date, months: int) -> date:
    """The day BEFORE the same date `months` later (a 12-month policy from 5 March ends on 4 March next year)."""
    total = start.year * 12 + (start.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    day = min(start.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day) - timedelta(days=1)


def today() -> date:
    return datetime.now(timezone.utc).date()


def _bad(code: str, **params) -> DomainError:
    return DomainError("Please check the insurance details", code=code, params=params or None, status_code=422)


def quote(*, rates: dict[str, float], product: str, plan: str, currency: str, start_date: date, end_date: date | None, region: str | None, travelers: int | None,
          months: int | None, plate: str | None, address: str | None) -> Quote:
    """Price and validate one policy. `rates` is the exchange rates snapshot (units per 1 USD): the premium is converted with the same
    code the currency exchange uses. Raises a coded error for anything the form should not have allowed."""
    if product not in PRODUCTS:
        raise _bad("unknown_product")
    if plan not in PLANS[product]:
        raise _bad("unknown_plan")
    if currency not in SUPPORTED:
        raise _bad("unsupported_currency")
    if not (today() - timedelta(days=1) <= start_date <= today() + timedelta(days=MAX_START_AHEAD_DAYS)):
        raise _bad("bad_start_date")

    details: dict = {}
    if product == "travel":
        if region not in REGIONS:
            raise _bad("unknown_region")
        count = travelers or 1
        if not 1 <= count <= MAX_TRAVELERS:
            raise _bad("bad_travelers", max=MAX_TRAVELERS)
        if end_date is None or end_date < start_date:
            raise _bad("bad_end_date")
        days = (end_date - start_date).days + 1
        if days > MAX_TRIP_DAYS:
            raise _bad("trip_too_long", max=MAX_TRIP_DAYS)
        usd = TRAVEL_PER_DAY[plan] * days * count * REGIONS[region] // 100
        end = end_date
        details = {"region": region, "travelers": count, "days": days}
    elif product == "medical":
        if months not in MEDICAL_MONTHS:
            raise _bad("bad_term")
        usd = MEDICAL_PER_MONTH[plan] * months * (90 if months == 12 else 100) // 100  # a year costs 10% less
        end = add_months(start_date, months)
        details = {"months": months}
    elif product == "car":
        if months not in CAR_MONTHS:
            raise _bad("bad_term")
        cleaned = re.sub(r"[\s\-]", "", plate or "").upper()
        if not re.fullmatch(r"[0-9A-ZЀ-ӿ؀-ۿ]{4,12}", cleaned):
            raise _bad("bad_plate")
        usd = CAR_PRICE[plan][months]
        end = add_months(start_date, months)
        details = {"plate": cleaned, "months": months}
    else:  # home
        text = (address or "").strip()
        if not 5 <= len(text) <= 120:
            raise _bad("bad_address")
        usd = HOME_PER_YEAR[plan]
        end = add_months(start_date, 12)
        details = {"address": text, "months": 12}

    return Quote(premium=price_in(rates, usd, currency), coverage=price_in(rates, COVERAGE[product][plan], currency), currency=currency, start_date=start_date, end_date=end, details=details)


def new_policy_number(product: str) -> str:
    """INS-TRV-2026-K7Q2M9XA: readable on the phone, impossible to guess the next one."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return f"INS-{CODES[product]}-{today().year}-" + "".join(secrets.choice(alphabet) for _ in range(8))


def create_policy(db: Session, user: User, account: Account, *, product: str, plan: str, q: Quote, number: str, transfer_id: uuid.UUID) -> InsurancePolicy:
    """Freeze the policy. `holder_name` is copied now: a later change of profile name must not change a certificate already issued."""
    policy = InsurancePolicy(
        user_id=user.id, account_id=account.id, transfer_id=transfer_id, product=product, plan=plan, details=q.details, holder_name=user.full_name,
        premium=q.premium, coverage=q.coverage, currency=q.currency, start_date=q.start_date, end_date=q.end_date, policy_number=number,
    )
    db.add(policy)
    db.flush()
    return policy


def status_of(policy: InsurancePolicy) -> str:
    """upcoming | active | expired, from today's date (never stored, so it can never go stale)."""
    now = today()
    return "upcoming" if now < policy.start_date else "expired" if now > policy.end_date else "active"


def list_policies(db: Session, user: User) -> list[InsurancePolicy]:
    return list(db.scalars(select(InsurancePolicy).where(InsurancePolicy.user_id == user.id).order_by(InsurancePolicy.created_at.desc())))


def get_policy(db: Session, user: User, policy_id: uuid.UUID) -> InsurancePolicy:
    """404 (not 403) for other people's policies."""
    policy = db.scalar(select(InsurancePolicy).where(InsurancePolicy.id == policy_id, InsurancePolicy.user_id == user.id))
    if policy is None:
        raise NotFound("Policy not found", code="policy_not_found")
    return policy


def find_by_key(db: Session, user: User, idempotency_key: str, account_id: uuid.UUID) -> InsurancePolicy | None:
    """The policy a finished purchase with this idempotency key created, if any. Found by the KEY alone, not by the price: after a
    dropped connection the retry must get the original policy even if the exchange rate has moved since and a fresh quote differs."""
    transfer = db.scalar(select(Transfer).where(Transfer.initiated_by == user.id, Transfer.idempotency_key == idempotency_key))
    if transfer is None or transfer.from_account_id != account_id:
        return None
    return for_transfer(db, transfer.id)


def for_transfer(db: Session, transfer_id: uuid.UUID) -> InsurancePolicy | None:
    return db.scalar(select(InsurancePolicy).where(InsurancePolicy.transfer_id == transfer_id))
