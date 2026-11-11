from sqlalchemy import func, select

from app.models import Card, Notification, Transfer, User
from app.services import ledger
from scripts.seed_demo import DEMO_PASSWORD, DEMO_PIN, PEOPLE, seed


def counts(db):
    return [db.scalar(select(func.count()).select_from(m)) for m in (User, Transfer, Card, Notification)]


def test_seed_builds_a_consistent_believable_demo(client, db):
    assert seed(db)["created"] is True
    assert ledger.verify_ledger(db) == []  # every cent accounted for, nothing negative

    users, transfers, cards, notes = counts(db)
    assert users == len(PEOPLE) and cards == 1
    assert notes == 4  # one "money received" per seeded payment
    assert transfers >= 4 + len(PEOPLE) + 1  # payments + deposits + savings + card purchase


def test_seeded_customers_can_really_sign_in_and_pay(client, db):
    seed(db)
    login = client.post("/auth/login", json={"email": PEOPLE[0][0], "password": DEMO_PASSWORD})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = client.get("/users/me", headers=headers).json()
    assert me["has_pin"] is True and me["phone"] == PEOPLE[0][2]

    anna = client.post("/recipients/lookup", json={"phone": PEOPLE[1][2]}, headers=headers)
    assert anna.json()["name"] == "Anna S."

    accounts = client.get("/accounts", headers=headers).json()
    checking = next(a for a in accounts if a["type"] == "checking")
    pay = client.post(
        "/transfers",
        json={"from_account_id": checking["id"], "to_phone": PEOPLE[1][2], "amount": 1_000, "pin": DEMO_PIN},
        headers={**headers, "Idempotency-Key": "seed-login-test"},
    )
    assert pay.status_code == 201


def test_running_the_seed_twice_changes_nothing(client, db):
    seed(db)
    before = counts(db)
    assert seed(db) == {"created": False}
    assert counts(db) == before
