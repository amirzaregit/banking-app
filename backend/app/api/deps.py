import math
import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.services.errors import TooManyRequests
from app.services.ratelimit import limiter
from app.services.texts import pick_language

bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user: User
    session_id: uuid.UUID  # the login (token family) this request belongs to


def get_auth(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    try:
        payload = decode_access_token(creds.credentials)
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized from None  # never reveal WHY a token was rejected
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return AuthContext(user=user, session_id=session_id)


def get_current_user(auth: AuthContext = Depends(get_auth)) -> User:
    return auth.user


def rate_limited(bucket: str, limit: int, window_seconds: float):
    """Dependency factory: at most `limit` calls per user per window. Over the limit -> 429."""

    def dependency(user: User = Depends(get_current_user)) -> None:
        retry_after = limiter.check(bucket, str(user.id), limit, window_seconds)
        if retry_after is not None:
            raise TooManyRequests(
                "Too many requests. Please slow down.",
                headers={"Retry-After": str(math.ceil(retry_after))},
                params={"seconds": math.ceil(retry_after)},
            )

    return dependency


def get_language(accept_language: str | None = Header(default=None)) -> str:
    """The user's language ('en' | 'ru' | 'fa'), from the Accept-Language header the app sends."""
    return pick_language(accept_language)
