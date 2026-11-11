from pydantic import BaseModel


class RatesResponse(BaseModel):
    base: str  # always "USD"
    rates: dict[str, float]  # units of each currency per 1 USD
    updated_at: str  # when the provider last updated, ISO 8601
    source: str  # who to credit
    stale: bool  # True = both providers failed and these are the last known rates
