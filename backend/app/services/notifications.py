"""In-app notifications. Every function adds to the CALLER's transaction (nothing commits here),
so a notification exists if and only if the event it describes really happened."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Notification


def notify(
    db: Session,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    dedupe_key: str | None = None,
    params: dict | None = None,
) -> None:
    """Queue a notification. With a dedupe_key, repeating the same event is a harmless no-op
    (the database's UNIQUE constraint decides, so it holds even under concurrent requests)."""
    db.execute(
        pg_insert(Notification)
        .values(id=uuid.uuid4(), user_id=user_id, kind=kind, title=title[:100], body=body[:300], dedupe_key=dedupe_key, params=params)
        .on_conflict_do_nothing(constraint="uq_notifications_user_dedupe")
    )


def list_for(db: Session, user_id: uuid.UUID, limit: int) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc(), Notification.id)
            .limit(limit)
        )
    )


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
        )
        or 0
    )


def mark_all_read(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
