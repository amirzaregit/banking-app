"""Create demo customers with believable history. Safe to run repeatedly (it skips if they exist).

    docker compose exec api python -m scripts.seed_demo

All demo accounts share the password and PIN below. They are FAKE, for demos only.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.seed import ensure_system_accounts
from app.db.session import SessionLocal
from app.models import AccountType, User
from app.services import accounts as account_service
from app.services import cards as card_service
from app.services import ledger, notifications, pin as pin_service
from app.services.format import format_money
from app.services.phone import mask_name

DEMO_PASSWORD = "demo-pass-123"
DEMO_PIN = "739162"

PEOPLE = [
    ("ivan@example.com", "Ivan Petrov", "+79120000001"),
    ("anna@example.com", "Anna Smirnova", "+79120000002"),
    ("oleg@example.com", "Oleg Kuznetsov", "+79120000003"),
]

# (sender, recipient, cents, message): becomes a transfer plus a "money received" notification
PAYMENTS = [
    ("anna@example.com", "ivan@example.com", 2_500, "Pizza last night"),
    ("ivan@example.com", "oleg@example.com", 1_200, "Taxi"),
    ("oleg@example.com", "anna@example.com", 4_000, "Concert ticket"),
    ("ivan@example.com", "anna@example.com", 750, "Coffee"),
]


def seed(db: Session) -> dict:
    ensure_system_accounts(db)
    if db.scalar(select(User).where(User.email == PEOPLE[0][0])) is not None:
        return {"created": False}

    users: dict[str, User] = {}
    checking = {}
    for email, name, phone in PEOPLE:
        user = User(email=email, password_hash=hash_password(DEMO_PASSWORD), full_name=name, phone=phone)
        db.add(user)
        db.flush()
        pin_service.set_pin(db, user, DEMO_PIN)
        checking[email] = account_service.open_account(db, user.id, AccountType.CHECKING)
        users[email] = user
        ledger.deposit(db, account_id=checking[email].id, amount=150_000, description="Salary")

    savings = account_service.open_account(db, users["ivan@example.com"].id, AccountType.SAVINGS)
    ledger.deposit(db, account_id=savings.id, amount=500_000, description="Savings top-up")

    for i, (sender, recipient, cents, message) in enumerate(PAYMENTS):
        transfer = ledger.post_transfer(
            db,
            from_account_id=checking[sender].id,
            to_account_id=checking[recipient].id,
            amount=cents,
            initiated_by=users[sender].id,
            idempotency_key=f"seed-payment-{i}",
            description=message,
        )
        notifications.notify(
            db,
            users[recipient].id,
            "payment_received",
            "Money received",
            f"{mask_name(users[sender].full_name)} sent you {format_money(cents)}. “{message}”",
            dedupe_key=f"transfer:{transfer.id}",
            params={"sender": mask_name(users[sender].full_name), "amount": cents, "currency": "USD", "description": message},
        )

    ivan_card = card_service.create_card(db, checking["ivan@example.com"])
    card_service.authorize_purchase(db, users["ivan@example.com"], ivan_card, checking["ivan@example.com"], "Coffee House", 450)

    db.commit()
    return {"created": True, "users": len(PEOPLE), "payments": len(PAYMENTS)}


def main() -> None:
    with SessionLocal() as db:
        result = seed(db)
    if not result["created"]:
        print("Demo data already exists; nothing to do.")
        return
    print(f"Created {result['users']} demo customers with history. Sign in with any of:")
    for email, name, phone in PEOPLE:
        print(f"  {name:16} {email:20} phone {phone}")
    print(f"Password: {DEMO_PASSWORD}   Payment PIN: {DEMO_PIN}")


if __name__ == "__main__":
    main()
