"""Official certificates: issued from real ledger data, frozen under a reference number, private to their owner."""

import re
import time

import pytest

from app.core.config import settings

from tests.conftest import TEST_PIN, register_and_login


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def fund(client, h, account, amount):
    assert client.post(f"/accounts/{account['id']}/deposit", json={"amount": amount}, headers=h).status_code == 200


def pay(client, h, src, dst_number, amount, key):
    body = {"from_account_id": src["id"], "to_account_number": dst_number, "amount": amount, "pin": TEST_PIN}
    r = client.post("/transfers", json=body, headers={**h, "Idempotency-Key": key})
    assert r.status_code == 201, r.text


@pytest.fixture(autouse=True)
def no_interval_limit(monkeypatch):
    """Most tests create several certificates in a row: switch the 5-second limit off (one test turns it on again)."""
    monkeypatch.setattr(settings, "certificate_interval_seconds", 0)


def issue(client, h, type_, keep=True, **extra):
    """Most tests look at stored certificates, so they keep a copy; the "not stored" tests pass keep=False."""
    return client.post("/certificates", json={"type": type_, "keep": keep, **extra}, headers=h)


@pytest.fixture
def world(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_check = accounts_of(client, a)[0]
    b_check = accounts_of(client, b)[0]
    savings = client.post("/accounts", json={"type": "savings"}, headers=a).json()
    fund(client, a, a_check, 50_000)  # $500 from the bank
    fund(client, b, b_check, 10_000)
    pay(client, b, b_check, a_check["account_number"], 2_000, "cert-key-0001")  # $20 income from Bob
    pay(client, a, a_check, savings["account_number"], 1_000, "cert-key-0002")  # $10 to her own savings: NOT income
    return {"a": a, "b": b, "check": a_check, "savings": savings, "b_check": b_check}


def test_every_type_can_be_issued_with_a_reference_number(client, world):
    for type_ in ("account_confirmation", "balance", "statement", "bank_details", "income", "proof_of_funds", "relationship", "no_debt"):
        r = issue(client, world["a"], type_, account_id=world["check"]["id"], language="ru")
        assert r.status_code == 201, (type_, r.text)
        body = r.json()
        assert re.fullmatch(r"[A-Z]{2}-\d{4}-\d{8}", body["ref_number"]) and body["language"] == "ru"
        assert body["data"]["customer"]["full_name"] == "Alice Smith"  # the customer's OWN full name, not masked


def test_balance_certificate_states_the_balance_at_issue_and_stays_frozen(client, world):
    cert = issue(client, world["a"], "balance", account_id=world["check"]["id"]).json()
    assert cert["data"]["account"]["balance"] == 50_000 + 2_000 - 1_000
    fund(client, world["a"], world["check"], 5_000)  # money arrives AFTER the certificate was issued
    again = client.get(f"/certificates/{cert['id']}", headers=world["a"]).json()
    assert again["data"]["account"]["balance"] == 51_000  # still the balance on the day it was issued
    assert again["ref_number"] == cert["ref_number"]


def test_a_type_that_needs_an_account_refuses_to_run_without_one(client, world):
    r = issue(client, world["a"], "balance")
    assert r.status_code == 422 and r.json()["code"] == "account_required"


def test_types_without_an_account_ignore_one_if_given(client, world):
    r = issue(client, world["a"], "relationship", account_id=world["check"]["id"])
    assert r.status_code == 201 and "account" not in r.json()["data"]
    assert len(r.json()["data"]["accounts"]) == 2


def test_income_counts_outside_money_only(client, world):
    cert = issue(client, world["a"], "income", account_id=world["check"]["id"]).json()
    # the $500 bank deposit and Bob's $20 are outside money; the $10 from her own savings flow is not
    assert cert["data"]["total"] == 50_000 + 2_000
    assert cert["data"]["count"] == 2
    assert sum(m["amount"] for m in cert["data"]["months"]) == cert["data"]["total"]


def test_income_ignores_money_moved_from_your_own_other_account(client, world):
    pay(client, world["a"], world["check"], world["savings"]["account_number"], 3_000, "cert-key-0003")
    savings = world["savings"]
    # now move it back: it arrives on checking FROM her own savings account
    body = {"from_account_id": savings["id"], "to_account_number": world["check"]["account_number"], "amount": 2_500, "pin": TEST_PIN}
    assert client.post("/transfers", json=body, headers={**world["a"], "Idempotency-Key": "cert-key-0004"}).status_code == 201
    cert = issue(client, world["a"], "income", account_id=world["check"]["id"]).json()
    assert cert["data"]["total"] == 52_000  # unchanged


def test_statement_has_lines_totals_and_a_period(client, world):
    cert = issue(client, world["a"], "statement", account_id=world["check"]["id"]).json()
    d = cert["data"]
    assert d["totals"]["income"] == 52_000 and d["totals"]["spending"] == 0  # the savings move is internal
    assert len(d["lines"]) == 3 and d["lines"][0]["amount"] == 50_000  # oldest first
    assert d["period"]["from"] is not None and d["period"]["to"] is not None  # defaults to the last 90 days
    explicit = issue(client, world["a"], "statement", account_id=world["check"]["id"], date_from="2001-01-01", date_to="2001-01-31").json()
    assert explicit["data"]["lines"] == []


def test_a_reversed_period_is_refused(client, world):
    r = issue(client, world["a"], "statement", account_id=world["check"]["id"], date_from="2026-02-01", date_to="2026-01-01")
    assert r.status_code in (400, 422)


def test_proof_of_funds_shows_four_dates_ending_with_todays_balance(client, world):
    d = issue(client, world["a"], "proof_of_funds", account_id=world["check"]["id"]).json()["data"]
    assert len(d["balances"]) == 4
    assert d["balances"][-1]["amount"] == 51_000
    assert d["lowest"] == 0 and d["lowest"] <= d["average"] <= 51_000  # before the account was funded it held nothing


def test_bank_details_carry_the_banks_codes(client, world):
    d = issue(client, world["a"], "bank_details", account_id=world["check"]["id"]).json()["data"]
    assert d["bank"]["swift"] and d["bank"]["bic"] and d["account"]["number"] == world["check"]["account_number"]


def test_no_debt_reports_how_many_accounts_were_checked(client, world):
    d = issue(client, world["a"], "no_debt").json()["data"]
    assert d["accounts_checked"] == 2 and d["overdrawn"] == 0


def test_certificates_are_private(client, world):
    cert = issue(client, world["a"], "balance", account_id=world["check"]["id"]).json()
    assert client.get(f"/certificates/{cert['id']}", headers=world["b"]).status_code == 404
    assert client.get("/certificates", headers=world["b"]).json() == []
    assert issue(client, world["b"], "balance", account_id=world["check"]["id"]).status_code == 404  # not Bob's account


def test_the_list_is_newest_first_and_names_the_account(client, world):
    first = issue(client, world["a"], "balance", account_id=world["check"]["id"]).json()
    second = issue(client, world["a"], "no_debt").json()
    items = client.get("/certificates", headers=world["a"]).json()
    assert [i["id"] for i in items] == [second["id"], first["id"]]
    assert items[1]["account_number"] == world["check"]["account_number"] and items[0]["account_number"] is None


def test_unknown_type_or_language_is_rejected(client, world):
    assert issue(client, world["a"], "visa_for_free").status_code == 422
    assert issue(client, world["a"], "no_debt", language="de").status_code == 422


def test_reference_numbers_are_unique(client, world):
    refs = {issue(client, world["a"], "no_debt").json()["ref_number"] for _ in range(5)}
    assert len(refs) == 5


# ---------------------------------------------------------------- not stored by default, and the 5-second limit

def test_by_default_nothing_is_stored_on_the_server(client, world):
    r = client.post("/certificates", json={"type": "balance", "account_id": world["check"]["id"]}, headers=world["a"])
    assert r.status_code == 201
    body = r.json()
    assert body["kept"] is False and re.fullmatch(r"BC-\d{4}-\d{8}", body["ref_number"]) and body["data"]["account"]["balance"] == 51_000
    assert client.get("/certificates", headers=world["a"]).json() == []
    assert client.get(f"/certificates/{body['id']}", headers=world["a"]).status_code == 404


def test_keeping_a_copy_stores_it_and_lists_it(client, world):
    r = issue(client, world["a"], "balance", account_id=world["check"]["id"])
    assert r.json()["kept"] is True
    assert [i["id"] for i in client.get("/certificates", headers=world["a"]).json()] == [r.json()["id"]]


def test_a_new_certificate_needs_a_five_second_gap(client, world, monkeypatch):
    monkeypatch.setattr(settings, "certificate_interval_seconds", 5.0)
    first = issue(client, world["a"], "no_debt", keep=False)
    second = issue(client, world["a"], "no_debt", keep=False)
    assert first.status_code == 201
    assert second.status_code == 429 and second.json()["code"] == "rate_limited" and 1 <= int(second.headers["retry-after"]) <= 5
    # the limit is per customer: Bob is not held up by Alice
    assert issue(client, world["b"], "no_debt", keep=False).status_code == 201


def test_the_limit_clears_after_the_interval(client, world, monkeypatch):
    monkeypatch.setattr(settings, "certificate_interval_seconds", 0.4)
    assert issue(client, world["a"], "no_debt", keep=False).status_code == 201
    assert issue(client, world["a"], "no_debt", keep=False).status_code == 429
    time.sleep(0.5)
    assert issue(client, world["a"], "no_debt", keep=False).status_code == 201
