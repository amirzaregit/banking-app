import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CardOrderCreate(BaseModel):
    theme: Literal["light", "dark"]
    branch_id: str = Field(min_length=1, max_length=30)
    notify_by: Literal["app", "phone"] = "app"


class CardOrderResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    theme: str
    branch_id: str
    notify_by: str
    status: str  # pending | ready
    created_at: datetime


class BlockCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=30)
    details: str | None = Field(default=None, max_length=500)


class BlockRequestResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    card_id: uuid.UUID | None
    target: str  # account | card
    reason: str
    details: str | None
    status: str  # applied | pending_review | approved | rejected
    created_at: datetime


class UnblockRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=8)


class ReviewRequest(BaseModel):
    approve: bool
