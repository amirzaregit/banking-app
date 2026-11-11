from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, rate_limited
from app.core.security import verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.auth import SetPinRequest, UserResponse, VerifyPinRequest
from app.services import notifications, pin as pin_service
from app.services.errors import DomainError

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    """The signed-in customer's profile."""
    return user


@router.put(
    "/me/pin",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limited("pin_set", limit=5, window_seconds=900))],
)
def set_pin(body: SetPinRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Set or change the payment PIN. Needs the account password, so a stolen session can't."""
    # 403, not 401: the app treats 401 as "token expired" and would silently refresh.
    if not verify_password(body.password, user.password_hash):
        raise DomainError("Incorrect password", code="incorrect_password", status_code=403)
    changed = user.has_pin
    pin_service.set_pin(db, user, body.pin)
    notifications.notify(
        db,
        user.id,
        "pin_changed",
        "Payment PIN changed" if changed else "Payment PIN set",
        "If this wasn't you, change your password right away.",
        params={"first": not changed},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/pin/verify", status_code=status.HTTP_204_NO_CONTENT)
def verify_pin(body: VerifyPinRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Check a PIN without moving money (e.g. before enabling fingerprint payments).
    Wrong guesses count toward the same lockout as payments."""
    pin_service.verify_pin(db, user, body.pin)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
