import uuid
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth
from app.core import security
from app.core.config import settings
from app.db.session import get_db
from app.models import AccountType, RefreshToken, User
from app.services import accounts as account_service
from app.services import notifications
from app.services.errors import DomainError, NotFound, TooManyRequests
from app.services.phone import normalize_phone
from app.services.ratelimit import limiter
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    SessionResponse,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _issue_tokens(
    db: Session,
    user: User,
    family_id: uuid.UUID,
    device_name: str | None,
    ip: str | None,
    started_at: datetime | None = None,
) -> TokenResponse:
    raw = security.new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id,
            token_hash=security.hash_refresh_token(raw),
            device_name=device_name,
            ip_address=ip,
            **({"created_at": started_at} if started_at else {}),
            expires_at=_now() + timedelta(days=settings.refresh_token_days),
        )
    )
    return TokenResponse(
        access_token=security.create_access_token(user.id, family_id),
        refresh_token=raw,
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Create a customer, with a first checking account, and a phone number that others can pay."""
    phone = normalize_phone(body.phone)  # store ONE canonical form, whatever the user typed
    if phone is None:
        raise DomainError("Enter a valid phone number", code="invalid_phone", status_code=422)

    user = User(
        email=body.email.lower(),
        password_hash=security.hash_password(body.password),
        full_name=body.full_name.strip(),
        phone=phone,
    )
    db.add(user)
    try:
        db.flush()  # sends the INSERT now so a duplicate fails here
    except IntegrityError as e:
        db.rollback()
        constraint = getattr(getattr(e.orig, "diag", None), "constraint_name", "") or ""
        what = "Phone number" if "phone" in constraint else "Email"
        raise DomainError(f"{what} already registered", code="phone_taken" if what == "Phone number" else "email_taken", status_code=409) from None
    # Every new customer gets a checking account (their default), in the same transaction.
    account_service.open_account(db, user.id, AccountType.CHECKING)
    db.commit()
    return user


def _login_limits(email: str, ip: str) -> list[tuple[str, str, int]]:
    """(bucket, key, max failures). Three overlapping limits, all within one window."""
    n = settings.login_max_failures
    return [
        ("login_email_ip", f"{email}|{ip}", n),  # one account hammered from one place
        ("login_email", email, n * 4),  # one account guessed from MANY places
        ("login_ip", ip, n * 6),  # one machine trying MANY accounts
    ]


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Sign in with email and password. Returns an access token and a rotating refresh token, tied to this device's session."""
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    limits = _login_limits(email, ip)
    window = settings.login_window_seconds

    # 1. Already throttled? Applies to unknown emails too, so it reveals nothing.
    for bucket, key, limit in limits:
        retry_after = limiter.peek(bucket, key, limit, window)
        if retry_after is not None:
            minutes = max(1, math.ceil(retry_after / 60))
            raise TooManyRequests(
                f"Too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
                headers={"Retry-After": str(math.ceil(retry_after))},
                code="login_throttled",
                params={"minutes": minutes},
            )

    user = db.scalar(select(User).where(User.email == email))
    stored_hash = user.password_hash if user else security.DUMMY_HASH
    password_ok = security.verify_password(body.password, stored_hash)
    if not user or not password_ok or not user.is_active:
        for bucket, key, _ in limits:  # only FAILURES are counted
            limiter.record(bucket, key)
        raise DomainError("Incorrect email or password", code="invalid_credentials", status_code=401)

    limiter.clear("login_email_ip", f"{email}|{ip}")  # success wipes this pair's strikes
    # Alert on every sign-in after the first: if it wasn't you, this is how you find out.
    had_sessions = bool(db.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == user.id)))
    tokens = _issue_tokens(db, user, uuid.uuid4(), body.device_name, ip)
    if had_sessions:
        where = body.device_name or "a new device"
        notifications.notify(
            db,
            user.id,
            "new_sign_in",
            "New sign-in",
            f"Your account was signed in on {where}. If this wasn't you, change your password and sign out of other devices.",
            params={"device": body.device_name},
        )
    db.commit()
    return tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Swap a refresh token for a new pair. Using an old refresh token again ends that whole session (theft detection)."""
    invalid = DomainError("Invalid refresh token", code="invalid_refresh_token", status_code=401)
    token = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == security.hash_refresh_token(body.refresh_token))
        .with_for_update()
    )
    if token is None:
        raise invalid

    if token.revoked_at is not None:
        # An already-used token came back: it was copied. Kill the whole login.
        _revoke_family(db, token.family_id)
        db.commit()
        raise invalid
    if token.expires_at <= _now():
        raise invalid

    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise invalid

    token.revoked_at = _now()  # rotate: old token is single-use
    ip = request.client.host if request.client else None
    tokens = _issue_tokens(
        db, user, token.family_id, token.device_name, ip, started_at=token.created_at
    )
    db.commit()
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    """End this device's session."""
    token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == security.hash_refresh_token(body.refresh_token)
        )
    )
    if token is not None:
        _revoke_family(db, token.family_id)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=list[SessionResponse])
def list_sessions(auth: AuthContext = Depends(get_auth), db: Session = Depends(get_db)):
    """Devices currently logged in. One active token exists per login."""
    rows = db.scalars(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == auth.user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > _now(),
        )
        .order_by(RefreshToken.created_at.desc())
    ).all()
    return [
        SessionResponse(
            id=r.family_id,
            device_name=r.device_name,
            ip_address=r.ip_address,
            created_at=r.created_at,
            last_used_at=r.last_used_at,
            is_current=r.family_id == auth.session_id,
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Sign one of your other devices out."""
    owned = db.scalar(
        select(RefreshToken.id)
        .where(RefreshToken.family_id == session_id, RefreshToken.user_id == auth.user.id)
        .limit(1)
    )
    if owned is None:
        raise NotFound("Session not found", code="session_not_found")
    _revoke_family(db, session_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(auth: AuthContext = Depends(get_auth), db: Session = Depends(get_db)):
    """Sign out every device, including this one."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == auth.user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _revoke_family(db: Session, family_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
