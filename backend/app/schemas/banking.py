import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# All money amounts are integers in minor units (cents): 2050 == $20.50
MAX_AMOUNT = 1_800_000_000_000  # the largest of any currency (IRR); each currency's own cap is enforced in the routes


class OpenAccountRequest(BaseModel):
    type: Literal["checking", "savings"]
    currency: Literal["USD", "RUB", "IRR"] = "USD"


class DepositRequest(BaseModel):
    amount: int = Field(gt=0, le=1_800_000_000)  # demo top-up: about $1,000 per call (per-currency cap in the route)


class AccountResponse(BaseModel):
    id: uuid.UUID
    type: str
    account_number: str
    currency: str
    status: str
    is_default: bool
    balance: int
    created_at: datetime


class TransferRequest(BaseModel):
    from_account_id: uuid.UUID
    # Exactly one way to say who gets the money:
    to_phone: str | None = Field(default=None, min_length=1, max_length=32)
    to_account_number: str | None = Field(default=None, min_length=1, max_length=32)
    amount: int = Field(gt=0, le=MAX_AMOUNT)
    description: str | None = Field(default=None, max_length=140)
    pin: str = Field(pattern=r"^\d{6}$")  # payment PIN: required for every transfer
    otp: str | None = Field(default=None, pattern=r"^\d{6}$")  # one-time code, for larger payments
    gift_design: Literal["wedding", "anniversary", "graduation", "birthday", "friendship", "custom"] | None = None  # a gift card to go with the money
    request_token: str | None = Field(default=None, max_length=100)  # the payment request (link / QR) this payment settles

    @model_validator(mode="after")
    def exactly_one_recipient(self):
        if (self.to_phone is None) == (self.to_account_number is None):
            raise ValueError("Provide exactly one of to_phone or to_account_number")
        return self


class TransferResponse(BaseModel):
    id: uuid.UUID
    from_account_id: uuid.UUID
    recipient_name: str  # masked, e.g. "Ivan P."
    amount: int
    currency: str
    status: str
    description: str | None
    created_at: datetime
    gift_design: str | None = None
    new_balance: int  # sender's balance after this transfer


class TransactionResponse(BaseModel):
    id: int  # ledger entry id; also the pagination cursor
    transfer_id: uuid.UUID
    amount: int  # signed: negative = money out
    balance_after: int
    description: str | None
    counterparty_name: str
    counterparty_account_number: str
    created_at: datetime


class TransactionPage(BaseModel):
    items: list[TransactionResponse]
    next_cursor: int | None
