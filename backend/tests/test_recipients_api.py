"""Phone numbers, default accounts, recipient lookup, contact matching, payments by phone."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.services import ledger
from tests.conftest import TEST_PIN, fake_phone, register_and_login


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def fund(client, h, account_id, amount):
    assert client.post(f"/accounts/{account_id}/deposit", json={"amount": amount}, headers=h).status_code == 200


def lookup(client, h, **body):
    return client.post("/recipients/lookup", json=body, headers=h)


def match(client, h, phones):
    return client.post("/recipients/match", json={"phones": phones}, headers=h)


def send(client, h, from_id, amount, key="key-00000001", **recipient):
    return client.post(
        "/transfers",
        json={"from_account_id": from_id, "amount": amount, "pin": TEST_PIN, **recipient},
        headers={**h, "Idempotency-Key": key},
    )


@pytest.fixture
def world(client):
    """Alice (funded $100), Bob Tester and Carol Jones, each with a known phone number."""
    people = {}
    for key, email, name in [("alice", "alice@example.com", "Alice Smith"),
                             ("bob", "bob@example.com", "Bob Tester"),
                             ("carol", "carol@example.com", "Carol Jones")]:
        phone = fake_phone()
        h = register_and_login(client, email, name, phone=phone)
        people[key] = {"h": h, "phone": phone, "acc": accounts_of(client, h)[0]}
    fund(client, people["alice"]["h"], people["alice"]["acc"]["id"], 10_000)
    return people


# ---------------------------------------------------------------- registration & phone

def test_register_stores_the_canonical_phone(client):
    h = register_and_login(client, "z@example.com", "Zed Zimmer", phone="8 (912) 555-01-23")
    me = client.get("/users/me", headers=h).json()
    assert me["phone"] == "+79125550123"


def test_same_number_in_a_different_format_is_a_duplicate(client):
    register_and_login(client, "a@example.com", phone="+7 912 555 01 23")
    r = client.post(
        "/auth/register",
        json={"email": "b@example.com", "password": "correct-horse-1", "full_name": "B", "phone": "8-912-555-01-23"},
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "Phone number already registered"


def test_duplicate_email_still_reports_email(client):
    register_and_login(client, "a@example.com")
    r = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "correct-horse-1", "full_name": "B", "phone": fake_phone()},
    )
    assert r.status_code == 409 and r.json()["detail"] == "Email already registered"


@pytest.mark.parametrize("phone", ["12345", "not a phone", "+7 123"])
def test_invalid_phone_is_rejected(client, phone):
    r = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "correct-horse-1", "full_name": "A", "phone": phone},
    )
    assert r.status_code == 422


def test_phone_is_required(client):
    r = client.post(
        "/auth/register", json={"email": "a@example.com", "password": "correct-horse-1", "full_name": "A"}
    )
    assert r.status_code == 422


# ---------------------------------------------------------------- default account

def test_first_account_is_default_and_new_ones_are_not(client, world):
    h = world["alice"]["h"]
    savings = client.post("/accounts", json={"type": "savings"}, headers=h).json()
    by_type = {a["type"]: a["is_default"] for a in accounts_of(client, h)}
    assert by_type == {"checking": True, "savings": False}
    assert savings["is_default"] is False


def test_set_default_moves_the_flag_and_keeps_exactly_one(client, world):
    h = world["alice"]["h"]
    savings = client.post("/accounts", json={"type": "savings"}, headers=h).json()
    r = client.put(f"/accounts/{savings['id']}/default", headers=h)
    assert r.status_code == 200 and r.json()["is_default"] is True
    flags = [a["is_default"] for a in accounts_of(client, h)]
    assert sorted(flags) == [False, True]


def test_cannot_set_someone_elses_account_as_default(client, world):
    r = client.put(f"/accounts/{world['bob']['acc']['id']}/default", headers=world["alice"]["h"])
    assert r.status_code == 404


def test_database_refuses_two_default_accounts_even_if_code_forgets(client, world, db):
    h = world["alice"]["h"]
    savings = client.post("/accounts", json={"type": "savings"}, headers=h).json()
    with pytest.raises(IntegrityError, match="uq_accounts_one_default_per_user"):
        db.execute(text("UPDATE accounts SET is_default = true WHERE id = :i"), {"i": savings["id"]})
        db.commit()
    db.rollback()


# ---------------------------------------------------------------- lookup

def test_lookup_by_phone_shows_a_masked_name_and_nothing_else(client, world):
    r = lookup(client, world["alice"]["h"], phone=world["bob"]["phone"])
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Bob T."
    assert body["via"] == "phone"
    assert body["account_number"] is None  # phone lookups never reveal the account number
    raw = r.text
    assert "Tester" not in raw and "bob@example.com" not in raw
    assert world["bob"]["acc"]["account_number"] not in raw
    assert world["bob"]["phone"] not in raw  # only a masked version comes back


def test_lookup_accepts_local_phone_formats(client, world):
    local = "8 (912) " + world["bob"]["phone"][5:8] + "-" + world["bob"]["phone"][8:10] + "-" + world["bob"]["phone"][10:12]
    assert lookup(client, world["alice"]["h"], phone=local).json()["name"] == "Bob T."


def test_lookup_by_account_number(client, world):
    number = world["bob"]["acc"]["account_number"]
    body = lookup(client, world["alice"]["h"], account_number=number).json()
    assert body == {"name": "Bob T.", "via": "account", "phone_masked": None, "account_number": number, "is_self": False, "account_id": None, "currency": "USD"}


def test_lookup_unknown_and_unable_to_receive_look_identical(client, world, db):
    h = world["alice"]["h"]
    unknown = lookup(client, h, phone="+79129999999")
    db.execute(text("UPDATE accounts SET status = 'frozen' WHERE id = :i"), {"i": world["carol"]["acc"]["id"]})
    db.commit()
    frozen = lookup(client, h, phone=world["carol"]["phone"])
    assert unknown.status_code == frozen.status_code == 404
    assert unknown.json() == frozen.json()  # can't tell "not a customer" from "can't receive"


def test_system_account_cannot_be_looked_up(client, world):
    assert lookup(client, world["alice"]["h"], account_number="SYSTEM-RESERVE-USD").status_code == 404


def test_lookup_validation_and_auth(client, world):
    h = world["alice"]["h"]
    assert lookup(client, h, phone="garbage").status_code == 422
    assert lookup(client, h).status_code == 422  # neither
    assert lookup(client, h, phone="+79120000001", account_number="123").status_code == 422  # both
    assert client.post("/recipients/lookup", json={"phone": "+79120000001"}).status_code == 401


# ---------------------------------------------------------------- contacts match

def test_match_returns_only_customers_and_echoes_the_raw_input(client, world):
    bob_local = "8 " + world["bob"]["phone"][2:]
    contacts = [bob_local, world["carol"]["phone"], "+7 912 777 77 77", "not-a-number", "12345"]
    r = match(client, world["alice"]["h"], contacts)
    assert r.status_code == 200
    assert {(m["input"], m["name"]) for m in r.json()} == {(bob_local, "Bob T."), (world["carol"]["phone"], "Carol J.")}


def test_match_never_returns_the_callers_own_number(client, world):
    r = match(client, world["alice"]["h"], [world["alice"]["phone"], world["bob"]["phone"]])
    assert [m["name"] for m in r.json()] == ["Bob T."]


def test_match_leaks_nothing_but_a_masked_name(client, world):
    r = match(client, world["alice"]["h"], [world["bob"]["phone"]])
    assert set(r.json()[0]) == {"input", "name"}
    assert "bob@example.com" not in r.text and world["bob"]["acc"]["account_number"] not in r.text


def test_match_with_nothing_or_too_much(client, world):
    h = world["alice"]["h"]
    assert match(client, h, []).json() == []
    assert match(client, h, [f"+7912{n:07d}" for n in range(501)]).status_code == 422
    assert match(client, h, [f"+7912{n:07d}" for n in range(500)]).status_code == 200


def test_match_skips_customers_who_cannot_receive(client, world, db):
    db.execute(text("UPDATE accounts SET status = 'frozen' WHERE id = :i"), {"i": world["carol"]["acc"]["id"]})
    db.commit()
    r = match(client, world["alice"]["h"], [world["carol"]["phone"], world["bob"]["phone"]])
    assert [m["name"] for m in r.json()] == ["Bob T."]


# ---------------------------------------------------------------- rate limits

def test_lookup_is_rate_limited_per_user(client, world):
    h = world["alice"]["h"]
    codes = [lookup(client, h, phone=world["bob"]["phone"]).status_code for _ in range(21)]
    assert codes[:20] == [200] * 20 and codes[20] == 429
    blocked = lookup(client, h, phone=world["bob"]["phone"])
    assert int(blocked.headers["Retry-After"]) > 0
    assert lookup(client, world["bob"]["h"], phone=world["carol"]["phone"]).status_code == 200  # others unaffected


def test_match_is_rate_limited(client, world):
    h = world["alice"]["h"]
    codes = [match(client, h, [world["bob"]["phone"]]).status_code for _ in range(7)]
    assert codes == [200] * 6 + [429]


# ---------------------------------------------------------------- paying by phone

def test_pay_by_phone_lands_in_the_default_account(client, world):
    a, b = world["alice"], world["bob"]
    r = send(client, a["h"], a["acc"]["id"], 2_500, to_phone=b["phone"], description="Pizza")
    assert r.status_code == 201, r.text
    assert r.json()["recipient_name"] == "Bob T."
    assert r.json()["new_balance"] == 7_500
    assert accounts_of(client, b["h"])[0]["balance"] == 2_500


def test_changing_the_default_redirects_future_phone_payments(client, world):
    a, b = world["alice"], world["bob"]
    savings = client.post("/accounts", json={"type": "savings"}, headers=b["h"]).json()
    client.put(f"/accounts/{savings['id']}/default", headers=b["h"])

    assert send(client, a["h"], a["acc"]["id"], 1_000, to_phone=b["phone"]).status_code == 201
    balances = {x["type"]: x["balance"] for x in accounts_of(client, b["h"])}
    assert balances == {"checking": 0, "savings": 1_000}


def test_pay_by_phone_accepts_local_format(client, world):
    a, b = world["alice"], world["bob"]
    local = "8 " + b["phone"][2:]
    assert send(client, a["h"], a["acc"]["id"], 100, to_phone=local).status_code == 201


def test_pay_by_phone_is_idempotent(client, world):
    a, b = world["alice"], world["bob"]
    r1 = send(client, a["h"], a["acc"]["id"], 2_000, key="retry-key-0001", to_phone=b["phone"])
    r2 = send(client, a["h"], a["acc"]["id"], 2_000, key="retry-key-0001", to_phone=b["phone"])
    assert r1.json()["id"] == r2.json()["id"]
    assert accounts_of(client, a["h"])[0]["balance"] == 8_000


def test_pay_by_account_number_still_works(client, world):
    a, b = world["alice"], world["bob"]
    r = send(client, a["h"], a["acc"]["id"], 500, to_account_number=b["acc"]["account_number"])
    assert r.status_code == 201 and r.json()["recipient_name"] == "Bob T."


def test_pay_validation(client, world):
    a, b = world["alice"], world["bob"]
    fid = a["acc"]["id"]
    assert send(client, a["h"], fid, 100).status_code == 422  # no recipient
    both = send(client, a["h"], fid, 100, to_phone=b["phone"], to_account_number=b["acc"]["account_number"])
    assert both.status_code == 422
    assert send(client, a["h"], fid, 100, to_phone="garbage").status_code == 422
    assert send(client, a["h"], fid, 100, to_phone="+79129999999").status_code == 404
    assert send(client, a["h"], fid, 1_000_000, to_phone=b["phone"]).status_code == 422  # insufficient funds


def test_cannot_pay_a_phone_whose_default_is_frozen(client, world, db):
    a, c = world["alice"], world["carol"]
    db.execute(text("UPDATE accounts SET status = 'frozen' WHERE id = :i"), {"i": c["acc"]["id"]})
    db.commit()
    assert send(client, a["h"], a["acc"]["id"], 100, to_phone=c["phone"]).status_code == 404
    assert accounts_of(client, a["h"])[0]["balance"] == 10_000


def test_ledger_stays_consistent_after_phone_payments(client, world, db):
    a, b, c = world["alice"], world["bob"], world["carol"]
    send(client, a["h"], a["acc"]["id"], 3_000, key="key-aaaaaaaa", to_phone=b["phone"])
    send(client, b["h"], b["acc"]["id"], 1_000, key="key-bbbbbbbb", to_phone=c["phone"])
    assert ledger.verify_ledger(db) == []
