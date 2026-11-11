import uuid
from datetime import datetime

from pydantic import BaseModel


class HistoryItem(BaseModel):
    id: int  # ledger entry id, also the pagination cursor
    transfer_id: uuid.UUID
    amount: int  # signed cents: negative = money out
    balance_after: int
    description: str | None
    counterparty_name: str
    counterparty_account_number: str
    created_at: datetime
    account_id: uuid.UUID  # which of YOUR accounts this line belongs to
    account_type: str
    account_number: str
    currency: str  # the currency of THIS line (the account's currency)
    card_id: uuid.UUID | None  # set when a card made this payment


class CurrencyTotals(BaseModel):
    currency: str
    income: int  # minor units that came in from outside
    spending: int  # minor units that went out to outside


class HistoryTotals(BaseModel):
    by_currency: list[CurrencyTotals]  # one entry per currency: amounts of different currencies are never added
    count: int


class HistoryPage(BaseModel):
    items: list[HistoryItem]
    next_cursor: int | None
    totals: HistoryTotals
