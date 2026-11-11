from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.currencies import SUPPORTED, system_account_number


def ensure_system_accounts(db: Session) -> None:
    """Create the bank's own accounts for every currency if missing. Safe to call repeatedly.
    Per currency: a reserve (pays out demo deposits), a merchants account (card purchases settle there),
    an FX pool (the other side of every currency conversion), and a services account (bill payments settle there)."""
    for currency in SUPPORTED:
        for kind in ("RESERVE", "MERCHANTS", "FX", "SERVICES"):
            db.execute(
                text(
                    "INSERT INTO accounts (id, user_id, type, account_number, currency, status) "
                    "VALUES (gen_random_uuid(), NULL, 'system', :num, :currency, 'active') "
                    "ON CONFLICT (account_number) DO NOTHING"
                ),
                {"num": system_account_number(kind, currency), "currency": currency},
            )
    db.commit()
