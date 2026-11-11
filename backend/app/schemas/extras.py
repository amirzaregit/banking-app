import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ---- top-up ---------------------------------------------------------------------------------------------------

TopUpMethod = Literal["card", "transfer", "cash"]


class TopUpRequest(BaseModel):
    amount: int = Field(gt=0, le=18_000_000_000)  # per-currency cap is enforced in the route
    method: TopUpMethod = "card"


# ---- payment requests -----------------------------------------------------------------------------------------

class PaymentRequestCreate(BaseModel):
    account_id: uuid.UUID
    amount: int | None = Field(default=None, gt=0, le=1_800_000_000_000)
    note: str | None = Field(default=None, max_length=140)


class PaymentRequestResponse(BaseModel):
    id: uuid.UUID
    token: str
    link: str
    amount: int | None
    currency: str
    note: str | None
    status: str  # open | paid | cancelled | expired
    created_at: datetime
    expires_at: datetime
    account_number: str


class PaymentRequestLookup(BaseModel):
    """What the person asked to pay sees. The destination is shown only as the account number the app feeds back to us."""

    token: str
    requester_name: str  # masked, "Ivan P."
    amount: int | None
    currency: str
    note: str | None
    status: str
    expires_at: datetime
    account_number: str
    is_mine: bool


# ---- bills ---------------------------------------------------------------------------------------------------

class ProviderResponse(BaseModel):
    id: str
    category: str
    currency: str
    reference: str  # phone_ru | phone_ir | account | none
    names: dict[str, str]


class BillRequest(BaseModel):
    provider_id: str
    reference: str | None = Field(default=None, max_length=40)
    from_account_id: uuid.UUID
    amount: int = Field(gt=0, le=1_800_000_000_000)
    pin: str = Field(pattern=r"^\d{6}$")
    otp: str | None = Field(default=None, pattern=r"^\d{6}$")


class BillResponse(BaseModel):
    id: uuid.UUID
    provider_id: str
    provider_name: str
    reference: str
    amount: int
    currency: str
    created_at: datetime
    new_balance: int
