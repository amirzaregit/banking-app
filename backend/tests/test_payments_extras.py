"""Top-up, payment requests (link / QR), bill payments and gifts."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import PaymentRequest
from app.services import bills, ledger
from tests.conftest import TEST_PIN, register_and_login


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def open_account(client, h, currency):
    r = client.post("/accounts", json={"type": "checking", "currency": currency}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def balance(client, h, account):
    return client.get(f"/accounts/{account['id']}", headers=h).json()["balance"]


def topup(client, h, account, amount, method="card"):
    return client.post(f"/accounts/{account['id']}/topup", json={"amount": amount, "method": method}, headers=h)


@pytest.fixture
def world(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_acc, b_acc = accounts_of(client, a)[0], accounts_of(client, b)[0]
    assert topup(client, a, a_acc, 20_000).status_code == 200  # $200
    assert topup(client, b, b_acc, 20_000).status_code == 200
    return {"a": a, "b": b, "a_acc": a_acc, "b_acc": b_acc}


def send(client, h, src, to_number, amount, key, **extra):
    body = {"from_account_id": src["id"], "to_account_number": to_number, "amount": amount, "pin": TEST_PIN, **extra}
    return client.post("/transfers", json=body, headers={**h, "Idempotency-Key": key})


# ================================================================ top-up

def test_topup_adds_money_in_the_accounts_currency(client, world, db):
    rub = open_account(client, world["a"], "RUB")
    r = topup(client, world["a"], rub, 500_000, "cash")
    assert r.status_code == 200 and r.json()["balance"] == 500_000
    tx = client.get(f"/accounts/{rub['id']}/transactions", headers=world["a"]).json()["items"][0]
    assert tx["description"] == "Top-up (cash)"
    assert ledger.verify_ledger(db) == []


def test_topup_has_a_cap_per_currency_and_validates_the_method(client, world):
    assert topup(client, world["a"], world["a_acc"], 10_000_001).status_code == 422  # over about $10,000... of USD cents
    assert client.post(f"/accounts/{world['a_acc']['id']}/topup", json={"amount": 100, "method": "bitcoin"}, headers=world["a"]).status_code == 422
    assert topup(client, world["b"], world["a_acc"], 100).status_code == 404  # not your account


# ================================================================ payment requests

def make_request(client, h, account, amount=None, note=None):
    body = {"account_id": account["id"]}
    if amount is not None:
        body["amount"] = amount
    if note:
        body["note"] = note
    r = client.post("/requests", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_a_request_has_a_link_a_token_and_starts_open(client, world):
    r = make_request(client, world["a"], world["a_acc"], 2_500, "Dinner")
    assert r["status"] == "open" and r["amount"] == 2_500 and r["currency"] == "USD" and r["note"] == "Dinner"
    assert r["link"].endswith(r["token"]) and len(r["token"]) >= 16
    assert make_request(client, world["a"], world["a_acc"])["token"] != r["token"]  # unguessable, unique


def test_lookup_shows_who_is_asking_masked(client, world):
    r = make_request(client, world["a"], world["a_acc"], 2_500, "Dinner")
    seen = client.get("/requests/lookup/" + r["token"], headers=world["b"]).json()
    assert seen["requester_name"] == "Alice S." and seen["amount"] == 2_500 and seen["is_mine"] is False
    assert seen["account_number"] == world["a_acc"]["account_number"]
    assert client.get("/requests/lookup/" + r["token"], headers=world["a"]).json()["is_mine"] is True
    assert client.get("/requests/lookup/nosuchtoken", headers=world["b"]).status_code == 404


def test_a_pasted_link_or_scanned_code_reduces_to_its_token():
    from app.services.payment_requests import link_for, token_from_text

    assert token_from_text(link_for("abc123XYZ")) == "abc123XYZ"
    assert token_from_text("  abc123XYZ  ") == "abc123XYZ"
    assert token_from_text("https://demo-bank.example/pay/abc123XYZ/") == "abc123XYZ"


def test_paying_a_request_settles_it_and_tells_the_requester(client, world):
    r = make_request(client, world["a"], world["a_acc"], 2_500, "Dinner")
    paid = send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 2_500, "req-key-0001", request_token=r["token"])
    assert paid.status_code == 201, paid.text
    assert balance(client, world["a"], world["a_acc"]) == 22_500
    mine = client.get("/requests", headers=world["a"]).json()
    assert mine[0]["status"] == "paid"
    notes = client.get("/notifications", headers=world["a"]).json()["items"]
    assert any(n["kind"] == "request_paid" and n["params"]["amount"] == 2_500 and n["params"]["payer"] == "Bob T." for n in notes)


def test_a_paid_request_cannot_be_paid_twice(client, world):
    r = make_request(client, world["a"], world["a_acc"], 1_000)
    assert send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 1_000, "req-key-0002", request_token=r["token"]).status_code == 201
    again = send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 1_000, "req-key-0003", request_token=r["token"])
    assert again.status_code == 409 and again.json()["code"] == "request_paid"
    assert balance(client, world["a"], world["a_acc"]) == 21_000


def test_a_retry_of_the_paying_request_is_safe(client, world):
    r = make_request(client, world["a"], world["a_acc"], 1_000)
    first = send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 1_000, "req-key-0004", request_token=r["token"])
    retry = send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 1_000, "req-key-0004", request_token=r["token"])
    assert first.status_code == retry.status_code == 201 and first.json()["id"] == retry.json()["id"]
    assert balance(client, world["a"], world["a_acc"]) == 21_000


def test_the_amount_must_match_a_fixed_request_but_an_open_one_takes_any(client, world):
    fixed = make_request(client, world["a"], world["a_acc"], 2_500)
    wrong = send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 2_000, "req-key-0005", request_token=fixed["token"])
    assert wrong.status_code == 422 and wrong.json()["code"] == "request_amount"
    open_ = make_request(client, world["a"], world["a_acc"])
    assert send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 777, "req-key-0006", request_token=open_["token"]).status_code == 201


def test_a_payment_to_a_different_account_does_not_settle_the_request(client, world):
    other = open_account(client, world["a"], "USD")
    r = make_request(client, world["a"], world["a_acc"], 1_000)
    wrong = send(client, world["b"], world["b_acc"], other["account_number"], 1_000, "req-key-0007", request_token=r["token"])
    assert wrong.status_code == 422 and wrong.json()["code"] == "request_mismatch"


def test_you_cannot_pay_your_own_request_and_cancelled_or_expired_ones_are_refused(client, world, db):
    own = make_request(client, world["a"], world["a_acc"], 1_000)
    b_second = open_account(client, world["a"], "USD")
    assert send(client, world["a"], b_second, world["a_acc"]["account_number"], 1_000, "req-key-0008", request_token=own["token"]).json()["code"] == "request_own"

    cancelled = make_request(client, world["a"], world["a_acc"], 1_000)
    assert client.post(f"/requests/{cancelled['id']}/cancel", headers=world["a"]).json()["status"] == "cancelled"
    assert send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 1_000, "req-key-0009", request_token=cancelled["token"]).json()["code"] == "request_cancelled"
    assert client.post(f"/requests/{cancelled['id']}/cancel", headers=world["b"]).status_code == 404  # not Bob's

    expiring = make_request(client, world["a"], world["a_acc"], 1_000)
    row = db.scalar(select(PaymentRequest).where(PaymentRequest.token == expiring["token"]))
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    assert client.get("/requests/lookup/" + expiring["token"], headers=world["b"]).json()["status"] == "expired"
    assert send(client, world["b"], world["b_acc"], world["a_acc"]["account_number"], 1_000, "req-key-0010", request_token=expiring["token"]).json()["code"] == "request_expired"


# ================================================================ bills

def pay_bill(client, h, account, provider, reference, amount, key, **extra):
    body = {"provider_id": provider, "reference": reference, "from_account_id": account["id"], "amount": amount, "pin": TEST_PIN, **extra}
    return client.post("/bills/pay", json=body, headers={**h, "Idempotency-Key": key})


def test_the_catalog_covers_every_category_in_both_countries(client, world):
    items = client.get("/bills/providers", headers=world["a"]).json()
    assert {p["category"] for p in items} == set(bills.CATEGORIES)
    assert {p["currency"] for p in items} == {"RUB", "IRR"}
    assert all(set(p["names"]) == {"en", "ru", "fa"} for p in items)
    assert len({p["id"] for p in items}) == len(items)


def test_paying_a_mobile_bill_moves_money_to_the_services_account(client, world, db):
    rub = open_account(client, world["a"], "RUB")
    topup(client, world["a"], rub, 300_000)
    r = pay_bill(client, world["a"], rub, "mts", "8 912 345 67 89", 50_000, "bill-key-0001")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["reference"] == "+79123456789" and body["provider_name"] == "MTS" and body["new_balance"] == 250_000
    tx = client.get(f"/accounts/{rub['id']}/transactions", headers=world["a"]).json()["items"][0]
    assert tx["counterparty_name"] == "Services" and tx["description"] == "MTS · +79123456789"
    assert ledger.verify_ledger(db) == []


def test_an_iranian_provider_is_paid_in_rials_with_an_iranian_number(client, world):
    irr = open_account(client, world["a"], "IRR")
    topup(client, world["a"], irr, 300_000_000)
    assert pay_bill(client, world["a"], irr, "irancell", "0935 123 4567", 10_000_000, "bill-key-0002").json()["reference"] == "+989351234567"
    assert pay_bill(client, world["a"], irr, "irancell", "+79123456789", 10_000_000, "bill-key-0003").json()["code"] == "invalid_reference"


def test_bills_are_refused_in_the_wrong_currency_or_with_a_bad_reference(client, world):
    rub = open_account(client, world["a"], "RUB")
    topup(client, world["a"], rub, 300_000)
    wrong_ccy = pay_bill(client, world["a"], world["a_acc"], "mts", "+79123456789", 1_000, "bill-key-0004")  # a USD account
    assert wrong_ccy.status_code == 422 and wrong_ccy.json()["code"] == "currency_mismatch" and wrong_ccy.json()["params"]["currency"] == "RUB"
    assert pay_bill(client, world["a"], rub, "mts", "12345", 1_000, "bill-key-0005").json()["code"] == "invalid_reference"
    assert pay_bill(client, world["a"], rub, "tavanir", "9876", 1_000, "bill-key-0006").json()["code"] == "currency_mismatch"
    assert pay_bill(client, world["a"], rub, "nobody", "9876", 1_000, "bill-key-0007").json()["code"] == "unknown_provider"
    assert pay_bill(client, world["a"], rub, "mosgaz", "x", 1_000, "bill-key-0008").json()["code"] == "invalid_reference"


def test_donations_need_no_reference(client, world):
    rub = open_account(client, world["a"], "RUB")
    topup(client, world["a"], rub, 300_000)
    r = pay_bill(client, world["a"], rub, "podari_zhizn", None, 10_000, "bill-key-0009")
    assert r.status_code == 201 and r.json()["reference"] == ""


def test_bill_rules_pin_funds_otp_and_retry(client, world):
    rub = open_account(client, world["a"], "RUB")
    topup(client, world["a"], rub, 600_000)
    bad_pin = client.post("/bills/pay", json={"provider_id": "mts", "reference": "+79123456789", "from_account_id": rub["id"], "amount": 1_000, "pin": "111111"}, headers={**world["a"], "Idempotency-Key": "bill-key-0010"})
    assert bad_pin.status_code == 403 and balance(client, world["a"], rub) == 600_000
    assert pay_bill(client, world["a"], rub, "mts", "+79123456789", 700_000, "bill-key-0011").json()["code"] == "insufficient_funds"
    big = pay_bill(client, world["a"], rub, "mts", "+79123456789", 500_000, "bill-key-0012")  # 5,000 RUB: above the ~$50 code limit
    assert big.status_code == 428 and big.json()["code"] == "otp_required"
    first = pay_bill(client, world["a"], rub, "mts", "+79123456789", 50_000, "bill-key-0013")
    retry = pay_bill(client, world["a"], rub, "mts", "+79123456789", 50_000, "bill-key-0013")
    assert first.json()["id"] == retry.json()["id"] and balance(client, world["a"], rub) == 550_000


# ================================================================ gifts

def test_a_gift_carries_its_design_and_message_to_the_recipient(client, world):
    r = send(client, world["a"], world["a_acc"], world["b_acc"]["account_number"], 2_000, "gift-key-0001", gift_design="birthday", description="Happy birthday!")
    assert r.status_code == 201 and r.json()["gift_design"] == "birthday"
    notes = client.get("/notifications", headers=world["b"]).json()["items"]
    gift = next(n for n in notes if n["kind"] == "payment_received" and n["params"].get("gift_design"))
    assert gift["params"]["gift_design"] == "birthday" and gift["params"]["description"] == "Happy birthday!"


def test_unknown_gift_designs_are_rejected_and_plain_payments_have_none(client, world):
    assert send(client, world["a"], world["a_acc"], world["b_acc"]["account_number"], 100, "gift-key-0002", gift_design="skull").status_code == 422
    plain = send(client, world["a"], world["a_acc"], world["b_acc"]["account_number"], 100, "gift-key-0003")
    assert plain.json()["gift_design"] is None
