"""Accounts in different currencies, and converting between the user's own accounts."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest

from app.services import conversion, ledger, rates as rates_service
from app.services.currencies import MINOR_DIGITS
from app.services.format import format_money
from tests.conftest import TEST_PIN, register_and_login

# Units per 1 USD, chosen so the arithmetic is easy to check by hand: 1 USD = 80 RUB = 1,600,000 IRR; 1 RUB = 20,000 IRR.
RATES = {"USD": 1.0, "RUB": 80.0, "IRR": 1_600_000.0, "AED": 3.6725, "EUR": 0.9, "CNY": 7.2, "JPY": 150.0}


@pytest.fixture(autouse=True)
def fixed_rates(monkeypatch):
    snapshot = rates_service.Snapshot("USD", RATES, "2026-10-30T00:00:00+00:00", "test")
    monkeypatch.setattr(rates_service, "get_rates", lambda now=None: (snapshot, False))


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def open_account(client, h, currency, type_="checking"):
    r = client.post("/accounts", json={"type": type_, "currency": currency}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["currency"] == currency
    return r.json()


def fund(client, h, account, amount):
    r = client.post(f"/accounts/{account['id']}/deposit", json={"amount": amount}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def balance(client, h, account):
    return client.get(f"/accounts/{account['id']}", headers=h).json()["balance"]


def convert(client, h, src, dst, amount, to_amount, key="conv-0000001", **extra):
    body = {"from_account_id": src["id"], "to_account_id": dst["id"], "amount": amount, "expected_to_amount": to_amount, "pin": TEST_PIN, **extra}
    return client.post("/conversions", json=body, headers={**h, "Idempotency-Key": key})


@pytest.fixture
def me(client):
    h = register_and_login(client, "alice@example.com", "Alice Smith")
    usd = accounts_of(client, h)[0]
    rub = open_account(client, h, "RUB")
    irr = open_account(client, h, "IRR")
    fund(client, h, usd, 3_000)  # $30.00: under the $50 code limit
    return {"h": h, "usd": usd, "rub": rub, "irr": irr}


# ---------------------------------------------------------------- the arithmetic (pure)

def test_quote_converts_between_minor_units_and_rounds_down():
    # $30.00 -> rubles: 30 * 80 = 2,400.00 RUB = 240,000 kopecks
    assert conversion.quote(RATES, "USD", "RUB", 3_000)[0] == 240_000
    # 100.00 RUB -> rials (no subunit): 100 * 20,000 = 2,000,000 IRR
    assert conversion.quote(RATES, "RUB", "IRR", 10_000)[0] == 2_000_000
    # rials -> dollars: 1,000,000 IRR = $0.625 -> rounded DOWN to 62 cents, never up
    assert conversion.quote(RATES, "IRR", "USD", 1_000_000)[0] == 62


def test_a_conversion_worth_less_than_the_smallest_unit_is_refused():
    with pytest.raises(Exception) as e:
        conversion.quote(RATES, "IRR", "USD", 100)  # 100 rials is a fraction of a cent
    assert getattr(e.value, "code", None) == "amount_too_small"


def test_money_formatting_follows_each_currency():
    assert (MINOR_DIGITS["USD"], MINOR_DIGITS["RUB"], MINOR_DIGITS["IRR"]) == (2, 2, 0)
    assert format_money(123_456, "USD") == "$1,234.56"
    assert format_money(123_456, "RUB") == "₽1,234.56"
    assert format_money(1_234_567, "IRR") == "IRR 1,234,567"


# ---------------------------------------------------------------- accounts in other currencies

def test_accounts_can_be_opened_and_funded_in_each_currency(client, me):
    h = me["h"]
    assert fund(client, h, me["rub"], 500_000)["balance"] == 500_000
    assert fund(client, h, me["irr"], 90_000_000)["balance"] == 90_000_000
    # the demo-deposit cap is per currency (about $1,000 each)
    assert client.post(f"/accounts/{me['rub']['id']}/deposit", json={"amount": 8_000_001}, headers=h).status_code == 422
    assert client.post("/accounts", json={"type": "checking", "currency": "EUR"}, headers=h).status_code == 422  # unsupported


def test_a_card_on_a_ruble_account_settles_in_rubles(client, me, db):
    h = me["h"]
    fund(client, h, me["rub"], 500_000)
    card = client.post(f"/accounts/{me['rub']['id']}/cards", headers=h).json()
    r = client.post(f"/cards/{card['id']}/purchase", json={"merchant": "Shop", "amount": 150_000}, headers=h)
    assert r.status_code == 200, r.text
    assert balance(client, h, me["rub"]) == 350_000
    assert ledger.verify_ledger(db) == []


# ---------------------------------------------------------------- converting

def test_conversion_moves_money_in_both_currencies_and_the_ledger_stays_healthy(client, me, db):
    h = me["h"]
    r = convert(client, h, me["usd"], me["rub"], 3_000, 240_000)
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["from_currency"], body["to_currency"], body["amount"], body["to_amount"]) == ("USD", "RUB", 3_000, 240_000)
    assert body["rate"] == 80.0
    assert (body["from_balance"], body["to_balance"]) == (0, 240_000)
    assert balance(client, h, me["usd"]) == 0 and balance(client, h, me["rub"]) == 240_000
    assert ledger.verify_ledger(db) == []  # every transfer cancels, and EACH currency sums to zero on its own


def test_the_two_legs_share_a_conversion_id_and_use_the_banks_fx_pools(client, me, db):
    from sqlalchemy import select

    from app.models import Account, Transfer

    convert(client, me["h"], me["usd"], me["rub"], 3_000, 240_000)
    legs = db.scalars(select(Transfer).where(Transfer.conversion_id.is_not(None))).all()
    assert len(legs) == 2 and legs[0].conversion_id == legs[1].conversion_id
    assert sorted(t.currency for t in legs) == ["RUB", "USD"]
    pools = {a.id: a.account_number for a in db.scalars(select(Account).where(Account.account_number.like("SYSTEM-FX-%")))}
    out_leg = next(t for t in legs if t.currency == "USD")
    in_leg = next(t for t in legs if t.currency == "RUB")
    assert pools[out_leg.to_account_id] == "SYSTEM-FX-USD" and pools[in_leg.from_account_id] == "SYSTEM-FX-RUB"


def test_conversion_to_rials_has_no_decimals(client, me):
    h = me["h"]
    fund(client, h, me["rub"], 10_000)
    r = convert(client, h, me["rub"], me["irr"], 10_000, 2_000_000)
    assert r.status_code == 201, r.text
    assert balance(client, h, me["irr"]) == 2_000_000


def test_a_moved_rate_is_refused_not_silently_applied(client, me):
    h = me["h"]
    r = convert(client, h, me["usd"], me["rub"], 3_000, 250_000)  # the user was shown a different amount
    assert r.status_code == 409 and r.json()["code"] == "rate_changed"
    assert r.json()["params"]["to_amount"] == 240_000
    assert balance(client, h, me["usd"]) == 3_000  # nothing moved


def test_quote_endpoint_previews_without_moving_money(client, me):
    h = me["h"]
    r = client.get("/conversions/quote", params={"from_account_id": me["usd"]["id"], "to_account_id": me["irr"]["id"], "amount": 3_000}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["to_amount"] == 48_000_000 and r.json()["stale"] is False
    assert balance(client, h, me["usd"]) == 3_000


def test_a_retry_with_the_same_key_converts_once(client, me, db):
    h = me["h"]
    first = convert(client, h, me["usd"], me["rub"], 3_000, 240_000, key="same-key-0001")
    again = convert(client, h, me["usd"], me["rub"], 3_000, 240_000, key="same-key-0001")
    assert first.status_code == 201 and again.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert balance(client, h, me["rub"]) == 240_000  # not 480,000
    assert ledger.verify_ledger(db) == []


def test_reusing_a_key_for_a_different_conversion_is_a_conflict(client, me):
    h = me["h"]
    convert(client, h, me["usd"], me["rub"], 1_000, 80_000, key="same-key-0002")
    r = convert(client, h, me["usd"], me["rub"], 2_000, 160_000, key="same-key-0002")
    assert r.status_code == 422 and r.json()["code"] == "idempotency_conflict"


def test_rules_that_refuse_a_conversion(client, me):
    h = me["h"]
    assert convert(client, h, me["usd"], me["rub"], 3_001, 240_080).json()["code"] == "insufficient_funds"
    same = open_account(client, h, "USD", "savings")
    assert convert(client, h, me["usd"], same, 100, 100).json()["code"] == "same_currency"
    assert convert(client, h, me["usd"], me["usd"], 100, 100).json()["code"] == "same_account"
    wrong_pin = client.post(
        "/conversions",
        json={"from_account_id": me["usd"]["id"], "to_account_id": me["rub"]["id"], "amount": 100, "expected_to_amount": 8_000, "pin": "111111"},
        headers={**h, "Idempotency-Key": "pin-key-0001"},
    )
    assert wrong_pin.status_code == 403 and balance(client, h, me["usd"]) == 3_000


def test_you_cannot_convert_into_someone_elses_account(client, me):
    other = register_and_login(client, "bob@example.com", "Bob Tester")
    bobs = accounts_of(client, other)[0]
    assert convert(client, me["h"], me["usd"], bobs, 100, 100).status_code == 404


def test_big_conversions_need_a_one_time_code_in_every_currency(client, me):
    h = me["h"]
    fund(client, h, me["rub"], 500_000)  # 5,000 RUB: above the ~$50 code limit for rubles (4,000 RUB)
    r = convert(client, h, me["rub"], me["usd"], 500_000, 6_250, key="otp-key-00001")
    assert r.status_code == 428 and r.json()["code"] == "otp_required"
    small = convert(client, h, me["rub"], me["usd"], 100_000, 1_250, key="otp-key-00002")  # 1,000 RUB: under the limit
    assert small.status_code == 201, small.text


def test_history_shows_both_legs_but_does_not_count_them_as_income_or_spending(client, me):
    h = me["h"]
    convert(client, h, me["usd"], me["rub"], 3_000, 240_000)
    page = client.get("/history", headers=h).json()
    exchange = [i for i in page["items"] if i["counterparty_name"] == "Currency exchange"]
    assert sorted((i["currency"], i["amount"]) for i in exchange) == [("RUB", 240_000), ("USD", -3_000)]
    by = {c["currency"]: c for c in page["totals"]["by_currency"]}
    assert by["USD"]["income"] == 3_000 and by["USD"]["spending"] == 0  # only the $30 demo deposit
    assert "RUB" not in by or (by["RUB"]["income"], by["RUB"]["spending"]) == (0, 0)


def test_simultaneous_conversions_never_overdraw_or_deadlock(client, me, db):
    h = me["h"]  # $30.00: exactly three $10.00 conversions can succeed
    def one(i):
        return convert(client, h, me["usd"], me["rub"], 1_000, 80_000, key=f"race-key-{i:04d}").status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        statuses = list(pool.map(one, range(6)))
    assert statuses.count(201) == 3 and statuses.count(422) == 3
    assert balance(client, h, me["usd"]) == 0 and balance(client, h, me["rub"]) == 240_000
    assert ledger.verify_ledger(db) == []


# ---------------------------------------------------------------- sending to other people

def test_sending_between_different_currencies_is_refused_before_asking_for_a_pin(client, me):
    other = register_and_login(client, "bob@example.com", "Bob Tester")
    bobs = accounts_of(client, other)[0]  # a USD account
    fund(client, me["h"], me["rub"], 100_000)
    body = {"from_account_id": me["rub"]["id"], "to_account_number": bobs["account_number"], "amount": 1_000, "pin": "000000"}
    r = client.post("/transfers", json=body, headers={**me["h"], "Idempotency-Key": "xcur-key-0001"})
    assert r.status_code == 422 and r.json()["code"] == "currency_mismatch"  # not a wrong-PIN 403: we never looked at the PIN


def test_recipient_lookup_says_which_currency_the_account_holds(client, me):
    r = client.post("/recipients/lookup", json={"account_number": me["rub"]["account_number"]}, headers=me["h"])
    assert r.status_code == 200 and r.json()["currency"] == "RUB" and r.json()["is_self"] is True


def test_statements_use_each_currencys_own_decimals(client, me):
    h = me["h"]
    fund(client, h, me["irr"], 90_000_000)
    csv = client.get(f"/accounts/{me['irr']['id']}/statement.csv", headers=h).text
    assert "90000000" in csv and "90000000.00" not in csv
    assert Decimal("90000000") == 90_000_000
