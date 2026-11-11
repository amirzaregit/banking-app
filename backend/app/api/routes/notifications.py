from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.notifications import NotificationList
from app.services import notifications as notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Newest first, plus how many are unread (use limit=1 to just fetch the badge number)."""
    return NotificationList(
        items=notification_service.list_for(db, user.id, limit),
        unread_count=notification_service.unread_count(db, user.id),
    )


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark every notification as read."""
    notification_service.mark_all_read(db, user.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
