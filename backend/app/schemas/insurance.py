import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class InsuranceDetails(BaseModel):
    """What to insure. Which fields matter depends on the product: travel needs `end_date`, `region`, `travelers`; medical
    needs `months`; car needs `plate` and `months`; home needs `address`."""

    product: str = Field(max_length=10)
    plan: str = Field(max_length=20)
    start_date: date
    end_date: date | None = None
    region: str | None = Field(default=None, max_length=12)
    travelers: int | None = Field(default=None, ge=1, le=20)
    months: int | None = Field(default=None, ge=1, le=36)
    plate: str | None = Field(default=None, max_length=24)
    address: str | None = Field(default=None, max_length=200)


class QuoteRequest(InsuranceDetails):
    currency: str = Field(min_length=3, max_length=3)


class QuoteResponse(BaseModel):
    premium: int
    coverage: int
    currency: str
    start_date: date
    end_date: date


class PurchaseRequest(InsuranceDetails):
    account_id: uuid.UUID
    pin: str = Field(min_length=4, max_length=8)
    otp: str | None = Field(default=None, min_length=6, max_length=6)
    # The price the customer was shown. If the exchange rate moved since, the server answers 409 `price_changed` instead of charging another amount.
    expected_premium: int | None = Field(default=None, gt=0)


class PolicyResponse(BaseModel):
    id: uuid.UUID
    policy_number: str
    product: str
    plan: str
    holder_name: str
    premium: int
    coverage: int
    currency: str
    start_date: date
    end_date: date
    status: str  # upcoming | active | expired
    details: dict
    account_number: str
    created_at: datetime
    new_balance: int | None = None  # only in the answer to a purchase
