from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import SmsMessage, User
from app.schemas.sms import SmsResponse
from app.services.errors import NotFound

router = APIRouter(prefix="/sms", tags=["demo"])


@router.get("/inbox", response_model=list[SmsResponse])
def inbox(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """DEMO ONLY: the texts this fake platform 'sent' you. A real bank has no such endpoint:
    the code goes to your phone's SMS app, never back through the banking API."""
    if not settings.demo_mode:
        raise NotFound("Not found", code="not_found")
    return db.scalars(
        select(SmsMessage).where(SmsMessage.user_id == user.id).order_by(SmsMessage.created_at.desc()).limit(20)
    ).all()
