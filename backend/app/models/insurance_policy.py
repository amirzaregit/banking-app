import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InsurancePolicy(Base):
    """A bought insurance policy. Everything the certificate prints is copied here at purchase, so it never changes afterwards."""

    __tablename__ = "insurance_policies"
    __table_args__ = (
        CheckConstraint("product IN ('travel', 'medical', 'car', 'home')", name="ck_insurance_product"),
        CheckConstraint("premium > 0", name="ck_insurance_premium_positive"),
        CheckConstraint("end_date >= start_date", name="ck_insurance_dates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"))
    # The payment. Unique: one payment buys exactly one policy, so a retried request can never create a second one.
    transfer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transfers.id"), unique=True)
    product: Mapped[str] = mapped_column(String(10))
    plan: Mapped[str] = mapped_column(String(20))
    details: Mapped[dict] = mapped_column(JSONB)
    holder_name: Mapped[str] = mapped_column(String(100))
    premium: Mapped[int] = mapped_column(BigInteger)
    coverage: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    policy_number: Mapped[str] = mapped_column(String(32), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
