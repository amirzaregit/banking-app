"""Converting money between two of the user's OWN accounts that hold different currencies.

A conversion is TWO ordinary transfers, one per currency, joined by the bank's FX pool accounts:

    USD ledger:  your USD account  --x-->  FX pool (USD)
    RUB ledger:  FX pool (RUB)     --y-->  your RUB account

Each leg is a normal two-row transfer in ONE currency, so every ledger rule still holds: every transfer sums to zero,
and each currency's ledger sums to zero on its own. Both legs are written in one database transaction (all or
nothing) and share a `conversion_id` and the rate that was used.
"""

import uuid
from decimal import ROUND_DOWN, Decimal, localcontext

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Transfer
from app.services import ledger
from app.services.currencies import MINOR_DIGITS, SUPPORTED
from app.services.errors import DomainError

DESCRIPTION = "Currency exchange"  # English marker: the app shows its own translated label for it


def rate_between(rates: dict[str, float], source: str, target: str) -> Decimal:
    """How many units of `target` one unit of `source` buys. `rates` is "units per 1 USD" (the rates service format)."""
    return Decimal(str(rates[target])) / Decimal(str(rates[source]))


def convert_amount(rates: dict[str, float], source: str, target: str, amount: int, *, rounding: str = ROUND_DOWN) -> tuple[int, Decimal]:
    """The one currency conversion of the whole backend: (`amount` of `source` as target minor units, rate).

    Everything that turns money of one currency into another goes through here (exchanging between your own accounts, pricing a
    service in the currency you pay in), so they all use the same rates and the same arithmetic. `rounding` says which way the
    last fraction of a minor unit goes: DOWN when the bank pays out, UP when the bank charges."""
    if source not in SUPPORTED or target not in SUPPORTED:
        raise DomainError("Unsupported currency", code="unsupported_currency", status_code=422)
    rate = rate_between(rates, source, target)
    major = Decimal(amount) / (Decimal(10) ** MINOR_DIGITS[source])
    with localcontext() as ctx:
        ctx.prec = 40  # plenty for a few trillion rials, and never silently rounds in the middle
        converted = int((major * rate * (Decimal(10) ** MINOR_DIGITS[target])).to_integral_value(rounding=rounding))
    return converted, rate


def quote(rates: dict[str, float], source: str, target: str, amount: int) -> tuple[int, Decimal]:
    """(amount you receive in the target's minor units, rate). Rounded DOWN: the bank never pays a fraction too much."""
    received, rate = convert_amount(rates, source, target, amount)
    if received <= 0:
        raise DomainError("That amount is too small to convert", code="amount_too_small", status_code=422)
    return received, rate


def convert(
    db: Session,
    *,
    user_id: uuid.UUID,
    source: Account,
    dest: Account,
    amount: int,
    to_amount: int,
    rate: Decimal,
    idempotency_key: str,
) -> tuple[Transfer, Transfer]:
    """Post both legs. Returns (leg in the source currency, leg in the target currency). Does not commit."""
    fx_out = ledger.get_fx_account(db, source.currency)  # receives what you pay
    fx_in = ledger.get_fx_account(db, dest.currency)  # pays what you get

    # Lock all four accounts together, in a fixed order, BEFORE writing anything: two conversions running at the same
    # time can then never wait on each other in a circle (deadlock). post_transfer's own locks are then no-ops.
    ledger.lock_accounts(db, [source.id, dest.id, fx_out.id, fx_in.id])

    conversion_id = uuid.uuid4()
    first = ledger.post_transfer(
        db,
        from_account_id=source.id,
        to_account_id=fx_out.id,
        amount=amount,
        initiated_by=user_id,
        idempotency_key=idempotency_key,
        description=DESCRIPTION,
        conversion_id=conversion_id,
        fx_rate=rate,
    )
    if first.conversion_id != conversion_id:
        # post_transfer found the same idempotency key already used by this exact request (a retry that raced us):
        # the money already moved, so do NOT post the second leg again.
        return first, second_leg(db, first)
    second = ledger.post_transfer(
        db,
        from_account_id=fx_in.id,
        to_account_id=dest.id,
        amount=to_amount,
        initiated_by=user_id,
        description=DESCRIPTION,
        conversion_id=conversion_id,
        fx_rate=rate,
    )
    return first, second


def second_leg(db: Session, first: Transfer) -> Transfer:
    """The other half of a conversion, given one half (used to answer a retry of a finished conversion)."""
    leg = db.scalar(select(Transfer).where(Transfer.conversion_id == first.conversion_id, Transfer.id != first.id))
    if leg is None:
        raise DomainError("Conversion is incomplete", code="conflict", status_code=409)
    return leg
