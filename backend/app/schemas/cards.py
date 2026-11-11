import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CardResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    last4: str
    expiry: str  # "MM/YY"
    status: str  # active | frozen (customer can undo) | blocked (final)
    created_at: datetime


class CardListItem(CardResponse):
    account_type: str  # which account this card belongs to
    account_number: str


class PurchaseRequest(BaseModel):
    merchant: str = Field(min_length=1, max_length=60)
    amount: int = Field(gt=0, le=1_800_000_000)  # demo: about $1,000 (per-currency cap in the route)


class PurchaseResponse(BaseModel):
    approved: bool
    transfer_id: uuid.UUID
    new_balance: int
