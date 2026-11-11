"""CSV statements: correctness, escaping, and spreadsheet-formula injection."""

import csv
import io
from datetime import datetime, timedelta, timezone

import pytest

from app.services import statements
from app.services.statements import decimal, safe_text
from tests.conftest import TEST_PIN, register_and_login


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def rows_of(response):
    """Parse the CSV the way a spreadsheet would (utf-8-sig drops the BOM)."""
    text = response.content.decode("utf-8-sig")
    return list(csv.reader(io.StringIO(text)))


def statement(client, h, account_id, **params):
    return client.get(f"/accounts/{account_id}/statement.csv", params=params, headers=h)


def pay(client, h, from_id, to_number, amount, description=None, key="key-00000001"):
    body = {"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": TEST_PIN}
    if description is not None:
        body["description"] = description
    r = client.post("/transfers", json=body, headers={**h, "Idempotency-Key": key})
    assert r.status_code == 201, r.text
    return r


@pytest.fixture
def pair(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_acc, b_acc = accounts_of(client, a)[0], accounts_of(client, b)[0]
    assert client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 10_000}, headers=a).status_code == 200
    return {"a": a, "b": b, "a_id": a_acc["id"], "b_id": b_acc["id"], "b_num": b_acc["account_number"], "a_num": a_acc["account_number"]}


# ---------------------------------------------------------------- pure helpers

@pytest.mark.parametrize("cents, text", [(0, "0.00"), (1, "0.01"), (-5, "-0.05"), (1250, "12.50"), (-123456789, "-1234567.89"), (100_000_000, "1000000.00")])
def test_decimal_uses_integer_math(cents, text):
    assert decimal(cents) == text


@pytest.mark.parametrize("value", ["=1+1", "+1", "-1+1", "@SUM(A1)", "\t=1", "\r=1"])
def test_formula_starts_are_neutralised(value):
    assert safe_text(value) == "'" + value


@pytest.mark.parametrize("value", ["Lunch", "Pizza = good", "a=b", "", None, "Bob T."])
def test_ordinary_text_is_untouched(value):
    assert safe_text(value) == (value or "")


# ---------------------------------------------------------------- the file

def test_the_file_has_the_right_headers_and_is_oldest_first(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 1_250, "Lunch")
    r = statement(client, pair["a"], pair["a_id"])
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"].startswith('attachment; filename="statement-')
    assert r.headers["cache-control"] == "no-store"  # a bank statement must not be cached

    header, *rows = rows_of(r)
    assert header == ["Date (UTC)", "Description", "Counterparty", "Amount (USD)", "Balance after (USD)", "Reference"]
    assert [(row[1], row[2], row[3], row[4]) for row in rows] == [
        ("Demo deposit", "Bank", "100.00", "100.00"),  # oldest first
        ("Lunch", "Bob Tester", "-12.50", "87.50"),
    ]


def test_the_file_starts_with_a_bom_so_excel_reads_utf8(client, pair):
    assert statement(client, pair["a"], pair["a_id"]).content.startswith(b"\xef\xbb\xbf")


def test_the_balance_column_matches_the_account(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 2_000)
    last = rows_of(statement(client, pair["a"], pair["a_id"]))[-1]
    assert last[4] == "80.00" and accounts_of(client, pair["a"])[0]["balance"] == 8_000


def test_special_characters_round_trip_exactly(client, pair):
    nasty = 'Dinner, "the good one"\nsecond line — Привет'
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 500, nasty)
    rows = rows_of(statement(client, pair["a"], pair["a_id"]))
    assert rows[-1][1] == nasty  # commas, quotes, a newline and Cyrillic all survive


def test_formula_injection_in_a_description_is_defused(client, pair):
    evil = '=HYPERLINK("http://evil.example","click")'
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 500, evil)
    cell = rows_of(statement(client, pair["a"], pair["a_id"]))[-1][1]
    assert cell == "'" + evil and not cell.startswith("=")


def test_formula_injection_through_a_counterpartys_name_is_defused(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    mallory = register_and_login(client, "m@example.com", "=cmd|' /C calc'!A0")
    a_acc, m_acc = accounts_of(client, a)[0], accounts_of(client, mallory)[0]
    client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 10_000}, headers=a)
    pay(client, a, a_acc["id"], m_acc["account_number"], 500)
    counterparty = rows_of(statement(client, a, a_acc["id"]))[-1][2]
    assert counterparty.startswith("'=cmd")


def test_negative_amounts_are_numbers_not_defused_text(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 500)
    amount = rows_of(statement(client, pair["a"], pair["a_id"]))[-1][3]
    assert amount == "-5.00"  # still a number a spreadsheet can add up


# ---------------------------------------------------------------- date filtering

def test_date_range_is_inclusive_and_utc(client, pair):
    # Statement dates are UTC, so the test must use UTC too (the local date can differ near midnight).
    today = datetime.now(timezone.utc).date()
    tomorrow, yesterday = today + timedelta(days=1), today - timedelta(days=1)
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 100)
    n = lambda **p: len(rows_of(statement(client, pair["a"], pair["a_id"], **p))) - 1  # minus the header
    assert n() == 2
    assert n(**{"from": str(yesterday), "to": str(tomorrow)}) == 2
    assert n(**{"from": str(tomorrow)}) == 0  # starts in the future
    assert n(**{"to": str(yesterday)}) == 0  # ended before anything happened


def test_bad_dates_and_reversed_ranges_are_refused(client, pair):
    assert statement(client, pair["a"], pair["a_id"], **{"from": "not-a-date"}).status_code == 422
    r = statement(client, pair["a"], pair["a_id"], **{"from": "2026-12-31", "to": "2026-01-01"})
    assert r.status_code == 400 and r.json()["code"] == "bad_date_range"


def test_an_enormous_statement_is_refused_not_streamed(client, pair, monkeypatch):
    monkeypatch.setattr(statements, "MAX_ROWS", 2)
    for i in range(2):
        pay(client, pair["a"], pair["a_id"], pair["b_num"], 100, key=f"key-0000000{i}")
    r = statement(client, pair["a"], pair["a_id"])  # deposit + 2 payments = 3 lines
    assert r.status_code == 422 and r.json()["code"] == "statement_too_long"


# ---------------------------------------------------------------- access

def test_you_cannot_export_someone_elses_statement(client, pair):
    assert statement(client, pair["b"], pair["a_id"]).status_code == 404


def test_login_is_required(client, pair):
    assert client.get(f"/accounts/{pair['a_id']}/statement.csv").status_code == 401


def test_the_recipients_statement_shows_money_in(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 1_250, "Lunch")
    rows = rows_of(statement(client, pair["b"], pair["b_id"]))
    assert [(r[1], r[2], r[3], r[4]) for r in rows[1:]] == [("Lunch", "Alice Smith", "12.50", "12.50")]
