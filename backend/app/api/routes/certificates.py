import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

import math

from app.api.deps import get_current_user
from app.core.config import settings
from app.services.errors import TooManyRequests
from app.services.ratelimit import limiter
from app.api.routes.accounts import get_owned_account
from app.db.session import get_db
from app.models import Account, Certificate, User
from app.schemas.certificates import CertificateRequest, CertificateResponse, CertificateSummary
from app.services import certificates as certificate_service
from app.services.errors import NotFound

router = APIRouter(prefix="/certificates", tags=["certificates"])


def _full(c: Certificate, kept: bool = True) -> CertificateResponse:
    return CertificateResponse(id=c.id, type=c.type, language=c.language, ref_number=c.ref_number, issued_at=c.issued_at, period_from=c.period_from, period_to=c.period_to, kept=kept, data=c.data)


def certificate_rate_limit(user: User = Depends(get_current_user)) -> None:
    """One new certificate per user every few seconds (building one reads the whole ledger for that account)."""
    interval = settings.certificate_interval_seconds
    if interval <= 0:
        return
    wait = limiter.check("certificates", str(user.id), 1, interval)
    if wait is not None:
        raise TooManyRequests(
            "Please wait a moment before creating another certificate.",
            headers={"Retry-After": str(math.ceil(wait))},
            params={"seconds": math.ceil(wait)},
        )


@router.post("", response_model=CertificateResponse, status_code=201, dependencies=[Depends(certificate_rate_limit)])
def create_certificate(body: CertificateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Issue a certificate: the facts are collected from the ledger and numbered. Nothing is stored unless `keep` is set;
    the app turns the facts into a PDF that the customer saves on their phone."""
    account = get_owned_account(db, user, body.account_id) if body.account_id else None
    certificate, kept = certificate_service.issue(db, user, body.type, body.language, account, body.date_from, body.date_to, body.keep)
    db.commit()
    return _full(certificate, kept)


@router.get("", response_model=list[CertificateSummary])
def list_certificates(limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Certificates the customer chose to keep a copy of (by default none is stored)."""
    rows = db.execute(
        select(Certificate, Account.account_number)
        .outerjoin(Account, Account.id == Certificate.account_id)
        .where(Certificate.user_id == user.id)
        .order_by(Certificate.issued_at.desc())
        .limit(limit)
    ).all()
    return [CertificateSummary(id=c.id, type=c.type, language=c.language, ref_number=c.ref_number, issued_at=c.issued_at, account_number=number) for c, number in rows]


@router.get("/{certificate_id}", response_model=CertificateResponse)
def get_certificate(certificate_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One kept certificate, exactly as issued. Other people's certificates answer 404."""
    certificate = db.scalar(select(Certificate).where(Certificate.id == certificate_id, Certificate.user_id == user.id))
    if certificate is None:
        raise NotFound("Certificate not found", code="certificate_not_found")  # 404, not 403: other people's documents do not exist
    return _full(certificate)
