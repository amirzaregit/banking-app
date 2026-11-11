import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel

CertificateType = Literal["account_confirmation", "balance", "statement", "bank_details", "income", "proof_of_funds", "relationship", "no_debt"]


class CertificateRequest(BaseModel):
    type: CertificateType
    language: Literal["en", "ru", "fa"] = "en"
    account_id: uuid.UUID | None = None
    date_from: date | None = None
    date_to: date | None = None
    keep: bool = False  # keep a copy in "My documents"; by default nothing is stored: the PDF is saved on the phone


class CertificateSummary(BaseModel):
    id: uuid.UUID
    type: str
    language: str
    ref_number: str
    issued_at: datetime
    account_number: str | None


class CertificateResponse(BaseModel):
    id: uuid.UUID
    type: str
    language: str
    ref_number: str
    issued_at: datetime
    period_from: date | None
    period_to: date | None
    kept: bool  # False = not stored on the server: the customer saves the PDF on their phone
    data: dict[str, Any]
