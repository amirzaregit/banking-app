"""The payment PIN: setting it, weak PINs, lockout, and its role in transfers."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal
from app.models import User
from app.services import pin as pin_service
from app.services.errors import PinInvalid
from tests.conftest import TEST_PASSWORD, TEST_PIN, fake_phone, register_and_login

WRONG_PIN = "908172"


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def fund(client, h, account_id, amount):
    assert client.post(f"/accounts/{account_id}/deposit", json={"amount": amount}, headers=h).status_code == 200


def send(client, h, from_id, to_number, amount=1_000, pin=TEST_PIN, key="key-00000001"):
    return client.post(
        "/transfers",
        json={"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": pin},
        headers={**h, "Idempotency-Key": key},
    )


@pytest.fixture
def pair(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_acc, b_acc = accounts_of(client, a)[0], accounts_of(client, b)[0]
    fund(client, a, a_acc["id"], 10_000)
    return {"a": a, "b": b, "a_acc": a_acc, "b_acc": b_acc, "a_id": client.get("/users/me", headers=a).json()["id"]}


def user_row(db, user_id):
    db.expire_all()
    return db.get(User, user_id)


# ---------------------------------------------------------------- setting a PIN

def test_has_pin_flips_after_setting_and_the_hash_never_leaks(client):
    creds = {"email": "x@example.com", "password": TEST_PASSWORD}
    client.post("/auth/register", json={**creds, "full_name": "X Y", "phone": fake_phone()})
    h = {"Authorization": "Bearer " + client.post("/auth/login", json=creds).json()["access_token"]}

    assert client.get("/users/me", headers=h).json()["has_pin"] is False
    assert client.put("/users/me/pin", json={"pin": TEST_PIN, "password": TEST_PASSWORD}, headers=h).status_code == 204
    me = client.get("/users/me", headers=h)
    assert me.json()["has_pin"] is True
    assert "pin_hash" not in me.text and TEST_PIN not in me.text


def test_setting_a_pin_needs_the_account_password(client, pair):
    r = client.put("/users/me/pin", json={"pin": "739162", "password": "not-my-password"}, headers=pair["a"])
    assert r.status_code == 403 and r.json()["detail"] == "Incorrect password"


@pytest.mark.parametrize("pin", ["000000", "111111", "123456", "654321", "234567", "123123", "121212"])
def test_weak_pins_are_refused(client, pair, pin):
    r = client.put("/users/me/pin", json={"pin": pin, "password": TEST_PASSWORD}, headers=pair["a"])
    assert r.status_code == 422 and r.json()["code"] == "weak_pin"


@pytest.mark.parametrize("pin", ["12345", "1234567", "abcdef", "12 456", ""])
def test_malformed_pins_are_refused(client, pair, pin):
    r = client.put("/users/me/pin", json={"pin": pin, "password": TEST_PASSWORD}, headers=pair["a"])
    assert r.status_code == 422


def test_changing_the_pin_replaces_the_old_one(client, pair):
    assert client.put("/users/me/pin", json={"pin": "739162", "password": TEST_PASSWORD}, headers=pair["a"]).status_code == 204
    old = send(client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"], pin=TEST_PIN)
    new = send(client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"], pin="739162", key="key-00000002")
    assert old.status_code == 403 and new.status_code == 201


def test_set_pin_is_rate_limited(client, pair):
    codes = [
        client.put("/users/me/pin", json={"pin": "739162", "password": "wrong-password"}, headers=pair["a"]).status_code
        for _ in range(6)
    ]
    # The fixture already used 1 of the 5 allowed attempts to create the PIN, so 4 remain.
    assert codes == [403] * 4 + [429] * 2


# ---------------------------------------------------------------- transfers need the PIN

def test_transfer_without_a_pin_set_is_refused_with_a_code(client):
    creds = {"email": "x@example.com", "password": TEST_PASSWORD}
    client.post("/auth/register", json={**creds, "full_name": "X Y", "phone": fake_phone()})
    h = {"Authorization": "Bearer " + client.post("/auth/login", json=creds).json()["access_token"]}
    other = register_and_login(client, "o@example.com", "O P")
    acc, other_acc = accounts_of(client, h)[0], accounts_of(client, other)[0]
    fund(client, h, acc["id"], 5_000)

    r = send(client, h, acc["id"], other_acc["account_number"])
    assert r.status_code == 403 and r.json()["code"] == "pin_not_set"


def test_correct_pin_moves_money(client, pair):
    r = send(client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"], 2_500)
    assert r.status_code == 201 and r.json()["new_balance"] == 7_500


def test_the_pin_field_is_required_and_must_be_six_digits(client, pair):
    base = {"from_account_id": pair["a_acc"]["id"], "to_account_number": pair["b_acc"]["account_number"], "amount": 100}
    h = {**pair["a"], "Idempotency-Key": "key-00000001"}
    assert client.post("/transfers", json=base, headers=h).status_code == 422
    assert client.post("/transfers", json={**base, "pin": "12"}, headers=h).status_code == 422


def test_wrong_pin_is_refused_counted_and_moves_nothing(client, pair, db):
    r = send(client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"], pin=WRONG_PIN)
    assert r.status_code == 403
    assert r.json()["code"] == "pin_invalid" and "4 attempts left" in r.json()["detail"]
    assert accounts_of(client, pair["a"])[0]["balance"] == 10_000
    # The crucial subtlety: the strike must SURVIVE the failed request (it is committed before raising).
    assert user_row(db, pair["a_id"]).pin_failed_attempts == 1


def test_five_wrong_pins_lock_it_and_even_the_right_pin_is_then_refused(client, pair, db):
    args = (client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"])
    codes = [send(*args, pin=WRONG_PIN, key=f"key-0000000{i}").json()["code"] for i in range(5)]
    assert codes == ["pin_invalid"] * 4 + ["pin_locked"]

    locked = send(*args, pin=TEST_PIN, key="key-00000009")  # correct PIN, but locked
    assert locked.status_code == 429 and locked.json()["code"] == "pin_locked"
    assert int(locked.headers["Retry-After"]) > 0
    assert accounts_of(client, pair["a"])[0]["balance"] == 10_000
    assert user_row(db, pair["a_id"]).pin_locked_until is not None  # stored in the DB, survives a restart


def test_lock_expires_and_the_right_pin_works_again(client, pair, db):
    args = (client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"])
    for i in range(5):
        send(*args, pin=WRONG_PIN, key=f"key-0000000{i}")
    db.execute(
        text("UPDATE users SET pin_locked_until = :t WHERE id = :i"),
        {"t": datetime.now(timezone.utc) - timedelta(seconds=1), "i": pair["a_id"]},
    )
    db.commit()
    assert send(*args, pin=TEST_PIN, key="key-00000009").status_code == 201


def test_a_correct_pin_resets_the_strike_count(client, pair, db):
    args = (client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"])
    for i in range(4):
        send(*args, pin=WRONG_PIN, key=f"key-0000000{i}")
    assert send(*args, pin=TEST_PIN, key="key-00000008").status_code == 201
    assert user_row(db, pair["a_id"]).pin_failed_attempts == 0
    for i in range(4):  # a fresh allowance, not 1 strike from the lock
        assert send(*args, pin=WRONG_PIN, key=f"key-1000000{i}").json()["code"] == "pin_invalid"


def test_concurrent_wrong_guesses_are_all_counted(client, pair, db):
    """Atomic SQL increments: four simultaneous wrong guesses must count as four, not fewer."""
    uid = pair["a_id"]

    def guess(_):
        with SessionLocal() as s:
            user = s.get(User, uid)
            try:
                pin_service.verify_pin(s, user, WRONG_PIN)
            except PinInvalid:
                pass

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(guess, range(4)))
    assert user_row(db, uid).pin_failed_attempts == 4


def test_a_retry_of_a_finished_payment_needs_no_pin(client, pair):
    args = (client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"])
    first = send(*args, 2_000, key="retry-key-0001")
    again = send(*args, 2_000, pin=WRONG_PIN, key="retry-key-0001")  # even a wrong PIN: nothing to authorize
    assert first.status_code == again.status_code == 201
    assert first.json()["id"] == again.json()["id"]
    assert accounts_of(client, pair["a"])[0]["balance"] == 8_000


def test_insufficient_funds_is_reported_after_the_pin(client, pair):
    assert send(client, pair["a"], pair["a_acc"]["id"], pair["b_acc"]["account_number"], 99_999).json()["code"] == "insufficient_funds"


# ---------------------------------------------------------------- verify endpoint

def test_verify_endpoint_accepts_the_right_pin_and_counts_wrong_ones(client, pair, db):
    assert client.post("/users/me/pin/verify", json={"pin": TEST_PIN}, headers=pair["a"]).status_code == 204
    r = client.post("/users/me/pin/verify", json={"pin": WRONG_PIN}, headers=pair["a"])
    assert r.status_code == 403 and r.json()["code"] == "pin_invalid"
    assert user_row(db, pair["a_id"]).pin_failed_attempts == 1
