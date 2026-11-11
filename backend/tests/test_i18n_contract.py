"""What the mobile app relies on to speak three languages: stable error codes + parameters,
notification parameters, the localized SMS, and the own-account flag on lookups."""

import re

import pytest

from app.core.config import settings
from app.services import statements
from app.services.texts import pick_language
from tests.conftest import TEST_PASSWORD, TEST_PIN, fake_phone, register_and_login

WRONG_PIN = "908172"


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


@pytest.fixture
def pair(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_acc, b_acc = accounts_of(client, a)[0], accounts_of(client, b)[0]
    client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 100_000}, headers=a)
    return {"a": a, "b": b, "a_id": a_acc["id"], "a_num": a_acc["account_number"], "b_id": b_acc["id"], "b_num": b_acc["account_number"],
            "b_phone": client.get("/users/me", headers=b).json()["phone"], "a_phone": client.get("/users/me", headers=a).json()["phone"]}


def pay(client, h, from_id, to_number, amount=1_000, key="key-00000001", pin=TEST_PIN, lang=None, otp=None):
    body = {"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": pin}
    if otp:
        body["otp"] = otp
    headers = {**h, "Idempotency-Key": key}
    if lang:
        headers["Accept-Language"] = lang
    return client.post("/transfers", json=body, headers=headers)


def error(r):
    return r.status_code, r.json().get("code"), r.json().get("params")


# ---------------------------------------------------------------- every error has a stable code

def test_sign_in_and_sign_up_errors(client):
    creds = {"email": "x@example.com", "password": TEST_PASSWORD}
    phone = fake_phone()
    client.post("/auth/register", json={**creds, "full_name": "X Y", "phone": phone})
    assert error(client.post("/auth/login", json={**creds, "password": "wrong-password"}))[:2] == (401, "invalid_credentials")
    dup_email = client.post("/auth/register", json={**creds, "full_name": "X", "phone": fake_phone()})
    dup_phone = client.post("/auth/register", json={"email": "y@example.com", "password": TEST_PASSWORD, "full_name": "Y", "phone": phone})
    bad_phone = client.post("/auth/register", json={"email": "z@example.com", "password": TEST_PASSWORD, "full_name": "Z", "phone": "12345"})
    assert error(dup_email)[:2] == (409, "email_taken")
    assert error(dup_phone)[:2] == (409, "phone_taken")
    assert error(bad_phone)[:2] == (422, "invalid_phone")
    assert error(client.post("/auth/refresh", json={"refresh_token": "nope"}))[:2] == (401, "invalid_refresh_token")


def test_login_throttle_carries_the_minutes(client):
    creds = {"email": "x@example.com", "password": "wrong-password"}
    for _ in range(5):
        client.post("/auth/login", json=creds)
    status, code, params = error(client.post("/auth/login", json=creds))
    assert (status, code) == (429, "login_throttled") and params == {"minutes": 15}


def test_validation_errors_get_a_code_but_keep_fastapis_shape(client):
    r = client.post("/auth/register", json={"email": "not-an-email", "password": "x"})
    assert r.status_code == 422 and r.json()["code"] == "validation_error" and isinstance(r.json()["detail"], list)


def test_pin_errors_carry_their_numbers(client, pair):
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], pin=WRONG_PIN)
    assert error(r) == (403, "pin_invalid", {"left": 4})
    weak = client.put("/users/me/pin", json={"pin": "123456", "password": TEST_PASSWORD}, headers=pair["a"])
    short = client.put("/users/me/pin", json={"pin": "12", "password": TEST_PASSWORD}, headers=pair["a"])
    assert error(weak) == (422, "weak_pin", {"reason": "weak"}) and error(short) == (422, "weak_pin", {"reason": "format"})
    wrong_pw = client.put("/users/me/pin", json={"pin": "739162", "password": "nope-nope-1"}, headers=pair["a"])
    assert error(wrong_pw)[:2] == (403, "incorrect_password")
    for i in range(4):
        last = pay(client, pair["a"], pair["a_id"], pair["b_num"], pin=WRONG_PIN, key=f"key-0000000{i + 2}")
    assert error(last) == (429, "pin_locked", {"minutes": 15})


def test_otp_errors_carry_their_numbers(client, pair):
    required = pay(client, pair["a"], pair["a_id"], pair["b_num"], 6_000)
    status, code, params = error(required)
    assert (status, code) == (428, "otp_required") and re.fullmatch(r"\+7•+\d{4}", params["phone"])
    wrong = pay(client, pair["a"], pair["a_id"], pair["b_num"], 6_000, otp="000000")
    assert error(wrong) == (403, "otp_invalid", {"left": 4}) or error(wrong)[1] == "otp_expired"


def test_money_and_account_errors(client, pair):
    assert error(pay(client, pair["a"], pair["a_id"], pair["b_num"], 99_999_999))[:2] == (422, "insufficient_funds")
    assert error(pay(client, pair["a"], pair["a_id"], "0000000000"))[:2] == (404, "recipient_not_found")
    assert error(pay(client, pair["a"], pair["a_id"], pair["a_num"]))[:2] == (422, "same_account")
    assert error(client.get("/accounts/00000000-0000-0000-0000-000000000000", headers=pair["a"]))[:2] == (404, "account_not_found")
    for _ in range(7):
        client.post("/accounts", json={"type": "savings"}, headers=pair["a"])
    assert error(client.post("/accounts", json={"type": "savings"}, headers=pair["a"])) == (422, "account_limit", {"max": 8})


def test_card_errors_carry_the_reason(client, pair):
    card = client.post(f"/accounts/{pair['a_id']}/cards", headers=pair["a"]).json()
    client.post(f"/cards/{card['id']}/freeze", headers=pair["a"])
    buy = lambda amount: client.post(f"/cards/{card['id']}/purchase", json={"merchant": "Shop", "amount": amount}, headers=pair["a"])
    assert error(buy(100)) == (422, "card_declined", {"reason": "frozen"})
    client.post(f"/cards/{card['id']}/unfreeze", headers=pair["a"])
    assert buy(100_000).status_code == 200  # the account holds exactly $1,000: this one is approved
    assert error(buy(100)) == (422, "card_declined", {"reason": "insufficient_funds"})  # and now it is empty
    for _ in range(2):
        client.post(f"/accounts/{pair['a_id']}/cards", headers=pair["a"])
    assert error(client.post(f"/accounts/{pair['a_id']}/cards", headers=pair["a"])) == (400, "card_limit", {"max": 3})
    missing = client.post("/cards/00000000-0000-0000-0000-000000000000/freeze", headers=pair["a"])
    assert error(missing)[:2] == (404, "card_not_found")


def test_statement_and_demo_gating_errors(client, pair, monkeypatch):
    monkeypatch.setattr(statements, "MAX_ROWS", 1)
    pay(client, pair["a"], pair["a_id"], pair["b_num"])
    assert error(client.get(f"/accounts/{pair['a_id']}/statement.csv", headers=pair["a"])) == (422, "statement_too_long", {"max": 1})
    monkeypatch.setattr(settings, "demo_mode", False)
    assert error(client.get("/sms/inbox", headers=pair["a"]))[:2] == (404, "not_found")


# ---------------------------------------------------------------- the localized SMS

@pytest.mark.parametrize(
    "header, expected",
    [(None, "en"), ("", "en"), ("fa", "fa"), ("fa-IR,fa;q=0.9,en;q=0.8", "fa"), ("ru-RU,ru;q=0.9", "ru"), ("de,fr;q=0.8", "en"),
     ("en;q=0.5, ru;q=0.9", "ru"), ("zz;q=abc, fa", "fa"), ("FA-ir", "fa")],
)
def test_language_is_picked_from_accept_language(header, expected):
    assert pick_language(header) == expected


@pytest.mark.parametrize("lang, marker", [(None, "Confirms $60.00 to Bob T. Never share"), ("ru", "Подтверждает перевод $60.00 получателю Bob T. Никому"), ("fa", "تأیید پرداخت $60.00 به Bob T. این کد")])
def test_the_sms_is_written_in_the_users_language(client, pair, lang, marker):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 6_000, lang=lang)
    body = client.get("/sms/inbox", headers=pair["a"]).json()[0]["body"]
    assert marker in body and re.search(r"\b\d{6}\b", body) and ".." not in body


# ---------------------------------------------------------------- notification params

def test_notifications_carry_what_the_app_needs_to_translate_them(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 1_250)
    items = {n["kind"]: n for n in client.get("/notifications", headers=pair["b"]).json()["items"]}
    assert items["payment_received"]["params"] == {"sender": "Alice S.", "amount": 1_250, "currency": "USD", "description": None, "gift_design": None}

    client.put("/users/me/pin", json={"pin": "739162", "password": TEST_PASSWORD}, headers=pair["a"])
    pins = [n for n in client.get("/notifications", headers=pair["a"]).json()["items"] if n["kind"] == "pin_changed"]
    assert [p["params"] for p in pins] == [{"first": False}, {"first": True}]

    card = client.post(f"/accounts/{pair['a_id']}/cards", headers=pair["a"]).json()
    client.post(f"/cards/{card['id']}/freeze", headers=pair["a"])
    client.post(f"/cards/{card['id']}/unfreeze", headers=pair["a"])
    client.post(f"/cards/{card['id']}/purchase", json={"merchant": "Coffee House", "amount": 450}, headers=pair["a"])
    mine = {n["kind"]: n["params"] for n in client.get("/notifications", headers=pair["a"]).json()["items"]}
    assert mine["card_frozen"] == {"last4": card["last4"]}
    assert mine["card_purchase"] == {"amount": 450, "currency": "USD", "merchant": "Coffee House", "last4": card["last4"]}

    creds = {"email": "alice@example.com", "password": TEST_PASSWORD}
    client.post("/auth/login", json={**creds, "device_name": "Pixel 8"})
    sign_in = [n for n in client.get("/notifications", headers=pair["a"]).json()["items"] if n["kind"] == "new_sign_in"][0]
    assert sign_in["params"] == {"device": "Pixel 8"}


# ---------------------------------------------------------------- lookup: "this is you"

def test_looking_up_your_own_phone_says_so_and_reveals_the_destination_account(client, pair):
    r = client.post("/recipients/lookup", json={"phone": pair["a_phone"]}, headers=pair["a"]).json()
    assert r["is_self"] is True and r["account_id"] == pair["a_id"]


def test_looking_up_your_own_account_number_says_so(client, pair):
    r = client.post("/recipients/lookup", json={"account_number": pair["a_num"]}, headers=pair["a"]).json()
    assert r["is_self"] is True and r["account_id"] == pair["a_id"]


def test_looking_up_someone_else_never_reveals_their_account_id(client, pair):
    for body in ({"phone": pair["b_phone"]}, {"account_number": pair["b_num"]}):
        r = client.post("/recipients/lookup", json=body, headers=pair["a"]).json()
        assert r["is_self"] is False and r["account_id"] is None
        assert pair["b_id"] not in str(r)
