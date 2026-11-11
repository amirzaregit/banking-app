"""One transaction in full: what it was, who was on the other side, and the facts a receipt prints.

It reuses the history query (`history.user_lines`, the same lines the statement shows) and the exchange's own lookup of the other
half of a conversion, so a line looks the same in the list, in its detail and on its receipt."""

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, LedgerEntry, Transfer
from app.services import conversion
from app.services.errors import NotFound
from app.services.history import user_lines, counterparty_name

# What a transaction is, from how it was made. The app writes the words.
KINDS = ("deposit", "top_up", "transfer", "gift", "card_payment", "bill", "insurance", "exchange")


@dataclass
class ExchangeLeg:
    rate: Decimal
    other_amount: int  # what the OTHER currency's side moved, in its minor units
    other_currency: str


@dataclass
class TransactionDetail:
    entry: LedgerEntry
    transfer: Transfer
    kind: str
    receipt_number: str
    counterparty_name: str
    counterparty_account_number: str
    account_id: uuid.UUID
    account_type: str
    account_number: str
    currency: str
    card_last4: str | None
    exchange: ExchangeLeg | None


def receipt_number(transfer_id: uuid.UUID) -> str:
    """The reference printed on a receipt: both sides of one payment share it ("RCP-3F9A1C07B2D4")."""
    return f"RCP-{transfer_id.hex[:12].upper()}"


def classify(transfer: Transfer, counterparty_number: str) -> str:
    """The first rule that fits wins: an exchange, an insurance or bill payment, a card payment, money from the bank, a gift, else a transfer."""
    if transfer.conversion_id is not None:
        return "exchange"
    provider = transfer.service_provider
    if provider and provider.startswith("insurance_"):
        return "insurance"
    if provider:
        return "bill"
    if transfer.card_id is not None or counterparty_number.startswith("SYSTEM-MERCHANTS-"):
        return "card_payment"
    if counterparty_number.startswith("SYSTEM-RESERVE-"):
        return "top_up" if (transfer.description or "").startswith("Top-up (") else "deposit"
    if transfer.gift_design:
        return "gift"
    return "transfer"


def get_detail(db: Session, user_id: uuid.UUID, entry_id: int) -> TransactionDetail:
    """404 (not 403) for anyone else's line: it does not reveal that it exists."""
    stmt, _other, _own = user_lines(user_id)
    row = db.execute(stmt.where(LedgerEntry.id == entry_id)).first()
    if row is None:
        raise NotFound("Transaction not found", code="transaction_not_found")
    entry, _description, other_number, other_name, own, _card_id = row
    transfer = db.get(Transfer, entry.transfer_id)

    exchange = None
    if transfer.conversion_id is not None:
        leg = conversion.second_leg(db, transfer)  # given one half of a conversion, the other half
        exchange = ExchangeLeg(rate=transfer.fx_rate, other_amount=leg.amount, other_currency=leg.currency)
    last4 = db.scalar(select(Card.last4).where(Card.id == transfer.card_id)) if transfer.card_id else None

    return TransactionDetail(
        entry=entry,
        transfer=transfer,
        kind=classify(transfer, other_number),
        receipt_number=receipt_number(transfer.id),
        counterparty_name=counterparty_name(other_name, other_number),
        counterparty_account_number=other_number,
        account_id=own.id,
        account_type=own.type,
        account_number=own.account_number,
        currency=own.currency,
        card_last4=last4,
        exchange=exchange,
    )
