import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    title: str
    body: str
    params: dict | None
    created_at: datetime
    read_at: datetime | None


class NotificationList(BaseModel):
    items: list[NotificationResponse]
    unread_count: int
