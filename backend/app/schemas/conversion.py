import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.banking import MAX_AMOUNT


class QuoteResponse(BaseModel):
    from_currency: str
    to_currency: str
    amount: int  # what you pay, in the source currency's minor units
    to_amount: int  # what you receive, in the target currency's minor units
    rate: float  # 1 unit of from_currency = rate units of to_currency
    rates_updated_at: str
    stale: bool  # True = the rate services are down and this is the last known rate


class ConversionRequest(BaseModel):
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: int = Field(gt=0, le=MAX_AMOUNT)
    expected_to_amount: int = Field(gt=0)  # what the user was shown; if the rate moved, we refuse and say so
    pin: str = Field(pattern=r"^\d{6}$")
    otp: str | None = Field(default=None, pattern=r"^\d{6}$")


class ConversionResponse(BaseModel):
    id: uuid.UUID  # the conversion id shared by both legs
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    from_currency: str
    to_currency: str
    amount: int
    to_amount: int
    rate: float
    created_at: datetime
    from_balance: int
    to_balance: int
