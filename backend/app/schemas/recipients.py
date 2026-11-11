import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

PhoneText = Annotated[str, StringConstraints(max_length=32)]


class LookupRequest(BaseModel):
    phone: PhoneText | None = None
    account_number: PhoneText | None = None

    @model_validator(mode="after")
    def exactly_one(self):
        if (self.phone is None) == (self.account_number is None):
            raise ValueError("Provide exactly one of phone or account_number")
        return self


class RecipientResponse(BaseModel):
    name: str  # masked: "Ivan P."
    via: Literal["phone", "account"]
    phone_masked: str | None = None
    account_number: str | None = None  # only echoed back for account lookups
    is_self: bool = False  # the recipient is YOU (e.g. your own phone or one of your accounts)
    account_id: uuid.UUID | None = None  # the destination account, revealed ONLY when it is your own
    currency: str  # the currency the recipient's account holds: only same-currency accounts can pay it


class MatchRequest(BaseModel):
    # Raw numbers exactly as they appear in the address book; the server normalizes them.
    phones: list[PhoneText] = Field(max_length=500)


class MatchItem(BaseModel):
    input: str  # the raw number the client sent, so it can map the result back to a contact
    name: str  # masked name of the customer who owns that number
