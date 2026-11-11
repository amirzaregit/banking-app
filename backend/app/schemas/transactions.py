import uuid
from datetime import datetime

from pydantic import BaseModel


class ExchangeInfo(BaseModel):
    rate: float  # units of the other currency for one unit of this one, as it was when the exchange happened
    other_amount: int  # what the other currency's side moved (minor units, positive)
    other_currency: str


class TransactionDetail(BaseModel):
    id: int  # the ledger entry id (the id the lists use)
    transfer_id: uuid.UUID
    receipt_number: str  # shared by both sides of the same payment
    kind: str  # deposit | top_up | transfer | gift | card_payment | bill | insurance | exchange
    amount: int  # signed minor units of `currency`: negative = money out
    currency: str
    balance_after: int
    created_at: datetime
    status: str
    description: str | None
    counterparty_name: str
    counterparty_account_number: str
    account_id: uuid.UUID  # which of YOUR accounts this line is on
    account_type: str
    account_number: str
    card_last4: str | None
    provider_id: str | None  # the bill or insurance provider that was paid
    gift_design: str | None
    exchange: ExchangeInfo | None
