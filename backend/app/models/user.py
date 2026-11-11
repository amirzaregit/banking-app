import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(100))
    # E.164 ("+79123456789"), the only form we store. Nullable for accounts that predate phones.
    phone: Mapped[str | None] = mapped_column(String(16), unique=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    pin_failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    @property
    def has_pin(self) -> bool:
        return self.pin_hash is not None
