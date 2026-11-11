"""In-app notifications: money received and security alerts."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import Notification, User
from app.services import notifications
from tests.conftest import TEST_PASSWORD, TEST_PIN, fake_phone, register_and_login

WRONG_PIN = "908172"


def inbox(client, h, limit=30):
    r = client.get("/notifications", params={"limit": limit}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def kinds(client, h):
    return [n["kind"] for n in inbox(client, h)["items"]]


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def pay(client, h, from_id, to_number, amount=1_250, key="key-00000001", description=None, pin=TEST_PIN):
    body = {"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": pin}
    if description:
        body["description"] = description
    return client.post("/transfers", json=body, headers={**h, "Idempotency-Key": key})


@pytest.fixture
def pair(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_acc, b_acc = accounts_of(client, a)[0], accounts_of(client, b)[0]
    assert client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 10_000}, headers=a).status_code == 200
    return {"a": a, "b": b, "a_id": a_acc["id"], "b_id": b_acc["id"], "b_num": b_acc["account_number"], "a_num": a_acc["account_number"]}


# ---------------------------------------------------------------- money received

def test_the_recipient_is_told_who_paid_and_how_much(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 1_250, description="Lunch")
    [n] = [n for n in inbox(client, pair["b"])["items"] if n["kind"] == "payment_received"]
    assert n["title"] == "Money received"
    assert n["body"] == "Alice S. sent you $12.50. “Lunch”"  # masked name, exact amount, the message
    assert "Smith" not in n["body"]


def test_the_sender_is_not_notified_of_their_own_payment(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"])
    assert "payment_received" not in kinds(client, pair["a"])


def test_moving_money_between_your_own_accounts_notifies_nobody(client, pair):
    savings = client.post("/accounts", json={"type": "savings"}, headers=pair["a"]).json()
    pay(client, pair["a"], pair["a_id"], savings["account_number"])
    assert "payment_received" not in kinds(client, pair["a"])


def test_a_failed_payment_leaves_no_notification(client, pair):
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], 5_000_000)  # more than Alice has
    assert r.status_code == 422
    assert "payment_received" not in kinds(client, pair["b"])


def test_a_wrong_pin_leaves_no_notification(client, pair):
    assert pay(client, pair["a"], pair["a_id"], pair["b_num"], pin=WRONG_PIN).status_code == 403
    assert "payment_received" not in kinds(client, pair["b"])


def test_a_retried_payment_notifies_once(client, pair):
    for _ in range(3):
        pay(client, pair["a"], pair["a_id"], pair["b_num"], key="retry-key-0001")
    assert kinds(client, pair["b"]).count("payment_received") == 1


def test_concurrent_notifies_for_one_event_collapse_to_one(client, pair, db):
    """The UNIQUE dedupe key decides, so even simultaneous requests can't double up."""
    uid = db.scalar(select(User.id).where(User.email == "bob@example.com"))

    def fire(_):
        with SessionLocal() as s:
            notifications.notify(s, uid, "payment_received", "Money received", "x", dedupe_key="transfer:same")
            s.commit()

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fire, range(6)))
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Notification).where(Notification.dedupe_key == "transfer:same")) == 1


# ---------------------------------------------------------------- listing and reading

def test_newest_first_with_an_unread_count(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 100, key="key-00000001")
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 200, key="key-00000002")
    data = inbox(client, pair["b"])
    received = [n for n in data["items"] if n["kind"] == "payment_received"]
    assert [("$2.00" in n["body"]) for n in received] == [True, False]  # the $2 one is newer
    assert data["unread_count"] == len(data["items"]) >= 2
    assert all(n["read_at"] is None for n in data["items"])


def test_the_badge_number_comes_cheaply_with_limit_1(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"])
    data = inbox(client, pair["b"], limit=1)
    assert len(data["items"]) == 1 and data["unread_count"] >= 1


def test_read_all_clears_the_badge_and_keeps_the_history(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"])
    assert client.post("/notifications/read-all", headers=pair["b"]).status_code == 204
    data = inbox(client, pair["b"])
    assert data["unread_count"] == 0 and len(data["items"]) >= 1 and all(n["read_at"] for n in data["items"])
    pay(client, pair["a"], pair["a_id"], pair["b_num"], key="key-00000002")  # a new one is unread again
    assert inbox(client, pair["b"])["unread_count"] == 1


def test_you_only_ever_see_your_own(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"])
    assert "payment_received" not in kinds(client, pair["a"])
    assert client.post("/notifications/read-all", headers=pair["a"]).status_code == 204
    assert inbox(client, pair["b"])["unread_count"] >= 1  # Alice's read-all did not touch Bob's


def test_notifications_require_login(client):
    assert client.get("/notifications").status_code == 401
    assert client.post("/notifications/read-all").status_code == 401


def test_limit_is_validated(client, pair):
    assert client.get("/notifications", params={"limit": 0}, headers=pair["a"]).status_code == 422
    assert client.get("/notifications", params={"limit": 101}, headers=pair["a"]).status_code == 422


# ---------------------------------------------------------------- security alerts

def test_signing_in_again_raises_an_alert_but_the_first_time_does_not(client):
    creds = {"email": "x@example.com", "password": TEST_PASSWORD}
    client.post("/auth/register", json={**creds, "full_name": "X Y", "phone": fake_phone()})
    first = client.post("/auth/login", json={**creds, "device_name": "Pixel 8"}).json()
    h = {"Authorization": f"Bearer {first['access_token']}"}
    assert "new_sign_in" not in kinds(client, h)

    client.post("/auth/login", json={**creds, "device_name": "Unknown tablet"})
    [alert] = [n for n in inbox(client, h)["items"] if n["kind"] == "new_sign_in"]
    assert "Unknown tablet" in alert["body"] and "wasn't you" in alert["body"]


def test_refreshing_a_session_is_not_a_new_sign_in(client):
    creds = {"email": "x@example.com", "password": TEST_PASSWORD}
    client.post("/auth/register", json={**creds, "full_name": "X Y", "phone": fake_phone()})
    first = client.post("/auth/login", json=creds).json()
    client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]})
    h = {"Authorization": f"Bearer {first['access_token']}"}
    assert "new_sign_in" not in kinds(client, h)


def test_setting_and_changing_the_pin_is_announced(client):
    h = register_and_login(client, "x@example.com", "X Y")  # the helper sets the PIN once
    assert kinds(client, h).count("pin_changed") == 1
    assert [n["title"] for n in inbox(client, h)["items"] if n["kind"] == "pin_changed"] == ["Payment PIN set"]

    client.put("/users/me/pin", json={"pin": "739162", "password": TEST_PASSWORD}, headers=h)
    titles = [n["title"] for n in inbox(client, h)["items"] if n["kind"] == "pin_changed"]
    assert titles == ["Payment PIN changed", "Payment PIN set"]


def test_locking_the_pin_raises_an_alert(client, pair):
    for i in range(5):
        pay(client, pair["a"], pair["a_id"], pair["b_num"], pin=WRONG_PIN, key=f"key-0000000{i}")
    [alert] = [n for n in inbox(client, pair["a"])["items"] if n["kind"] == "pin_locked"]
    assert "15 minutes" in alert["body"]


def test_freezing_a_card_is_announced_once_per_actual_change(client, pair):
    card = client.post(f"/accounts/{pair['a_id']}/cards", headers=pair["a"]).json()
    client.post(f"/cards/{card['id']}/freeze", headers=pair["a"])
    client.post(f"/cards/{card['id']}/freeze", headers=pair["a"])  # already frozen: says nothing
    client.post(f"/cards/{card['id']}/unfreeze", headers=pair["a"])
    assert kinds(client, pair["a"]).count("card_frozen") == 1
    assert kinds(client, pair["a"]).count("card_unfrozen") == 1


def test_an_approved_card_purchase_is_announced_a_declined_one_is_not(client, pair):
    card = client.post(f"/accounts/{pair['a_id']}/cards", headers=pair["a"]).json()
    client.post(f"/cards/{card['id']}/freeze", headers=pair["a"])
    client.post(f"/cards/{card['id']}/purchase", json={"merchant": "Coffee House", "amount": 450}, headers=pair["a"])
    assert "card_purchase" not in kinds(client, pair["a"])  # declined while frozen
    client.post(f"/cards/{card['id']}/unfreeze", headers=pair["a"])
    client.post(f"/cards/{card['id']}/purchase", json={"merchant": "Coffee House", "amount": 450}, headers=pair["a"])
    [n] = [n for n in inbox(client, pair["a"])["items"] if n["kind"] == "card_purchase"]
    assert "$4.50 at Coffee House" in n["body"]


def test_the_database_enforces_the_dedupe_key(client, pair, db):
    from sqlalchemy.exc import IntegrityError

    uid = db.scalar(select(User.id).where(User.email == "bob@example.com"))
    db.add_all([Notification(user_id=uid, kind="k", title="t", body="b", dedupe_key="same") for _ in range(2)])
    with pytest.raises(IntegrityError, match="uq_notifications_user_dedupe"):
        db.commit()
    db.rollback()
