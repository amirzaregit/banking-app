"""Buying insurance: prices, the payment, and the certificate data."""

from datetime import timedelta

import pytest

from app.services import conversion, pricing, rates as rates_service
from app.services import insurance as service
from tests.conftest import TEST_PIN, register_and_login


RATES = {"USD": 1.0, "RUB": 80.0, "IRR": 1_600_000.0, "AED": 3.6725, "EUR": 0.9, "CNY": 7.2, "JPY": 150.0}


def set_rates(monkeypatch, **changes):
    snapshot = rates_service.Snapshot("USD", {**RATES, **changes}, "2026-10-30T00:00:00+00:00", "test")
    monkeypatch.setattr(rates_service, "get_rates", lambda now=None: (snapshot, False))


@pytest.fixture(autouse=True)
def fixed_rates(monkeypatch):
    set_rates(monkeypatch)


def soon(days=0):
    return (service.today() + timedelta(days=days)).isoformat()


TRAVEL = {"product": "travel", "plan": "standard", "start_date": None, "end_date": None, "region": "europe", "travelers": 2}


def travel(**over):
    return {**TRAVEL, "start_date": soon(1), "end_date": soon(10), **over}  # 10 days


def cheap(**over):
    """Basic cover for 5 days in the CIS for one person: $6.00, below the one-time-code limit."""
    return {**TRAVEL, "plan": "basic", "region": "cis", "travelers": 1, "start_date": soon(1), "end_date": soon(5), **over}


PRICE = 600


@pytest.fixture
def me(client):
    h = register_and_login(client, "alice@example.com", "Alice Smith")
    acc = client.get("/accounts", headers=h).json()[0]
    assert client.post(f"/accounts/{acc['id']}/deposit", json={"amount": 100_000}, headers=h).status_code == 200  # $1,000
    return {"h": h, "acc": acc}


def buy(client, me, details, key="ins-key-0001", pin=TEST_PIN, **extra):
    return client.post("/insurance/policies", json={**details, "account_id": me["acc"]["id"], "pin": pin, **extra}, headers={**me["h"], "Idempotency-Key": key})


def balance(client, me):
    return client.get(f"/accounts/{me['acc']['id']}", headers=me["h"]).json()["balance"]


# ---------------------------------------------------------------- prices

def test_travel_price_follows_days_people_and_region(client, me):
    r = client.post("/insurance/quote", json={**travel(), "currency": "USD"}, headers=me["h"])
    # standard $2.50/day x 10 days x 2 travelers x 1.30 (Europe) = $65.00
    assert r.status_code == 200 and r.json()["premium"] == 6_500
    assert r.json()["coverage"] == 5_000_000  # $50,000


def test_the_same_policy_costs_the_same_value_in_every_currency(client, me):
    usd = client.post("/insurance/quote", json={**travel(), "currency": "USD"}, headers=me["h"]).json()["premium"]
    rub = client.post("/insurance/quote", json={**travel(), "currency": "RUB"}, headers=me["h"]).json()["premium"]
    irr = client.post("/insurance/quote", json={**travel(), "currency": "IRR"}, headers=me["h"]).json()["premium"]
    assert (usd, rub, irr) == (6_500, 520_000, 104_000_000)


def test_a_year_of_medical_cover_is_ten_percent_cheaper(client, me):
    def price(months):
        body = {"product": "medical", "plan": "basic", "start_date": soon(), "months": months, "currency": "USD"}
        return client.post("/insurance/quote", json=body, headers=me["h"]).json()
    assert price(1)["premium"] == 1_200
    assert price(12)["premium"] == 12_960  # 12 x 12.00 less 10%
    assert price(12)["end_date"] == service.add_months(service.today(), 12).isoformat()


def test_car_and_home_policies(client, me):
    car = client.post("/insurance/quote", json={"product": "car", "plan": "full", "start_date": soon(), "months": 6, "plate": "a 123 bc 77", "currency": "USD"}, headers=me["h"])
    assert car.status_code == 200 and car.json()["premium"] == 14_000
    home = client.post("/insurance/quote", json={"product": "home", "plan": "basic", "start_date": soon(), "address": "12 Tverskaya St, Moscow", "currency": "USD"}, headers=me["h"])
    assert home.json()["premium"] == 3_000


@pytest.mark.parametrize(
    "change, code",
    [
        ({"product": "boat"}, "unknown_product"),
        ({"plan": "gold"}, "unknown_plan"),
        ({"region": "mars"}, "unknown_region"),
        ({"travelers": 9}, "bad_travelers"),
        ({"start_date": soon(-30), "end_date": soon(-20)}, "bad_start_date"),
        ({"start_date": soon(5), "end_date": soon(2)}, "bad_end_date"),
        ({"end_date": soon(200)}, "trip_too_long"),
        ({"currency": "EUR"}, "unsupported_currency"),
    ],
)
def test_bad_details_are_refused_with_a_code(client, me, change, code):
    body = {**travel(), "currency": "USD", **change}
    r = client.post("/insurance/quote", json=body, headers=me["h"])
    assert r.status_code == 422 and r.json()["code"] == code


def test_car_needs_a_plate_and_home_an_address(client, me):
    base = {"start_date": soon(), "currency": "USD"}
    assert client.post("/insurance/quote", json={**base, "product": "car", "plan": "full", "months": 6, "plate": "!"}, headers=me["h"]).json()["code"] == "bad_plate"
    assert client.post("/insurance/quote", json={**base, "product": "car", "plan": "full", "months": 3, "plate": "A123BC"}, headers=me["h"]).json()["code"] == "bad_term"
    assert client.post("/insurance/quote", json={**base, "product": "home", "plan": "basic", "address": "x"}, headers=me["h"]).json()["code"] == "bad_address"


# ---------------------------------------------------------------- buying

def test_buying_charges_the_premium_and_issues_a_policy_in_the_holders_name(client, me):
    r = buy(client, me, cheap())
    assert r.status_code == 201
    p = r.json()
    assert p["holder_name"] == "Alice Smith" and p["premium"] == PRICE and p["status"] == "upcoming"
    assert p["policy_number"].startswith("INS-TRV-") and p["details"] == {"region": "cis", "travelers": 1, "days": 5}
    assert p["new_balance"] == 100_000 - PRICE and balance(client, me) == 100_000 - PRICE
    assert [x["id"] for x in client.get("/insurance/policies", headers=me["h"]).json()] == [p["id"]]
    assert client.get(f"/insurance/policies/{p['id']}", headers=me["h"]).json()["policy_number"] == p["policy_number"]
    assert "insurance_bought" in [n["kind"] for n in client.get("/notifications", headers=me["h"]).json()["items"]]


def test_a_retry_returns_the_same_policy_and_charges_once(client, me):
    first = buy(client, me, cheap(), key="ins-key-0002").json()
    again = buy(client, me, cheap(), key="ins-key-0002").json()
    assert first["id"] == again["id"]
    assert balance(client, me) == 100_000 - PRICE
    assert len(client.get("/insurance/policies", headers=me["h"]).json()) == 1


def test_the_policy_keeps_the_name_it_was_issued_under(client, me):
    p = buy(client, me, cheap()).json()
    from sqlalchemy import update
    from app.db.session import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        db.execute(update(User).where(User.email == "alice@example.com").values(full_name="Alice Jones"))
        db.commit()
    assert client.get(f"/insurance/policies/{p['id']}", headers=me["h"]).json()["holder_name"] == "Alice Smith"


def test_wrong_pin_buys_nothing(client, me):
    r = buy(client, me, cheap(), pin="000111")
    assert r.status_code == 403
    assert balance(client, me) == 100_000 and client.get("/insurance/policies", headers=me["h"]).json() == []


def test_not_enough_money_buys_nothing(client, me):
    poor = register_and_login(client, "poor@example.com", "Poor Person")
    acc = client.get("/accounts", headers=poor).json()[0]
    r = client.post("/insurance/policies", json={**cheap(), "account_id": acc["id"], "pin": TEST_PIN}, headers={**poor, "Idempotency-Key": "ins-key-0003"})
    assert r.status_code == 422 and r.json()["code"] == "insufficient_funds"
    assert client.get("/insurance/policies", headers=poor).json() == []


def test_a_large_premium_needs_the_sms_code(client, me):
    big = {"product": "car", "plan": "full", "start_date": soon(), "months": 12, "plate": "A123BC"}  # $250
    r = buy(client, me, big, key="ins-key-0004")
    assert r.status_code == 428 and r.json()["code"] == "otp_required"
    assert balance(client, me) == 100_000 and client.get("/insurance/policies", headers=me["h"]).json() == []


def test_a_blocked_account_cannot_buy(client, me):
    client.post(f"/accounts/{me['acc']['id']}/block", json={"reason": "not_using"}, headers=me["h"])
    r = buy(client, me, cheap())
    assert r.status_code == 422 and r.json()["code"] == "account_not_active"


def test_pays_in_the_accounts_own_currency(client, me):
    rub = client.post("/accounts", json={"type": "checking", "currency": "RUB"}, headers=me["h"]).json()
    assert client.post(f"/accounts/{rub['id']}/deposit", json={"amount": 1_000_000}, headers=me["h"]).status_code == 200
    r = client.post("/insurance/policies", json={**cheap(), "account_id": rub["id"], "pin": TEST_PIN}, headers={**me["h"], "Idempotency-Key": "ins-key-0005"})
    assert r.status_code == 201 and r.json()["currency"] == "RUB" and r.json()["premium"] == PRICE * 80


def test_other_peoples_accounts_and_policies_are_invisible(client, me):
    p = buy(client, me, cheap()).json()
    other = register_and_login(client, "bob@example.com", "Bob Jones")
    assert client.get(f"/insurance/policies/{p['id']}", headers=other).status_code == 404
    assert client.get("/insurance/policies", headers=other).json() == []
    stolen = client.post("/insurance/policies", json={**cheap(), "account_id": me["acc"]["id"], "pin": TEST_PIN}, headers={**other, "Idempotency-Key": "ins-key-0006"})
    assert stolen.status_code == 404


def test_status_follows_the_dates(client, me):
    p = buy(client, me, {**cheap(), "start_date": soon(0), "end_date": soon(3)}).json()
    assert p["status"] == "active"


def test_add_months_ends_the_day_before():
    from datetime import date
    assert service.add_months(date(2026, 3, 5), 12) == date(2027, 3, 4)
    assert service.add_months(date(2026, 1, 31), 1) == date(2026, 2, 27)  # Feb 28, minus one day
    assert service.add_months(date(2027, 12, 15), 1) == date(2028, 1, 14)


# ---------------------------------------------------------------- the shared currency code

def test_prices_use_the_exchange_code_and_round_up_to_a_tidy_amount():
    odd = {**RATES, "RUB": 91.37, "IRR": 1_234_567.0}
    # $6.00 at 91.37 rubles = 548.22 rubles: the bank never charges too little, so 549 whole rubles
    assert pricing.price_in(odd, 600, "RUB") == 54_900
    assert pricing.price_in(odd, 600, "USD") == 600
    assert pricing.price_in(odd, 600, "IRR") % 1_000 == 0 and pricing.price_in(odd, 600, "IRR") >= 7_407_402
    # and it is literally the exchange's own arithmetic, just rounded the other way
    exact, _ = conversion.convert_amount(odd, "USD", "RUB", 600)
    assert exact == 54_822 and conversion.quote(odd, "USD", "RUB", 600)[0] == exact


def test_the_exchange_still_rounds_down():
    assert conversion.convert_amount({**RATES, "RUB": 91.37}, "USD", "RUB", 600)[0] == 54_822
    assert conversion.quote({**RATES, "RUB": 91.37}, "USD", "RUB", 1)[0] == 91  # 1 cent = 0.9137 ruble = 91 kopecks


def test_a_changed_rate_changes_the_quote(client, me, monkeypatch):
    rub_body = {**cheap(), "currency": "RUB"}
    before = client.post("/insurance/quote", json=rub_body, headers=me["h"]).json()["premium"]
    set_rates(monkeypatch, RUB=100.0)
    after = client.post("/insurance/quote", json=rub_body, headers=me["h"]).json()["premium"]
    assert (before, after) == (48_000, 60_000)


def test_buying_at_a_price_that_moved_charges_nothing(client, me, monkeypatch):
    rub = client.post("/accounts", json={"type": "checking", "currency": "RUB"}, headers=me["h"]).json()
    client.post(f"/accounts/{rub['id']}/deposit", json={"amount": 1_000_000}, headers=me["h"])
    shown = client.post("/insurance/quote", json={**cheap(), "currency": "RUB"}, headers=me["h"]).json()["premium"]
    set_rates(monkeypatch, RUB=100.0)  # the rate moves while the customer looks at the price
    r = client.post("/insurance/policies", json={**cheap(), "account_id": rub["id"], "pin": TEST_PIN, "expected_premium": shown}, headers={**me["h"], "Idempotency-Key": "ins-key-0007"})
    assert r.status_code == 409 and r.json()["code"] == "price_changed" and r.json()["params"] == {"premium": 60_000}
    assert client.get(f"/accounts/{rub['id']}", headers=me["h"]).json()["balance"] == 1_000_000
    assert client.get("/insurance/policies", headers=me["h"]).json() == []


def test_a_retry_after_the_rate_moved_still_returns_the_first_policy(client, me, monkeypatch):
    rub = client.post("/accounts", json={"type": "checking", "currency": "RUB"}, headers=me["h"]).json()
    client.post(f"/accounts/{rub['id']}/deposit", json={"amount": 1_000_000}, headers=me["h"])
    body = {**cheap(), "account_id": rub["id"], "pin": TEST_PIN}
    headers = {**me["h"], "Idempotency-Key": "ins-key-0008"}
    first = client.post("/insurance/policies", json=body, headers=headers).json()
    set_rates(monkeypatch, RUB=100.0)  # the dropped-connection retry arrives after the rate refreshed
    again = client.post("/insurance/policies", json=body, headers=headers)
    assert again.status_code == 201 and again.json()["id"] == first["id"]
    assert client.get(f"/accounts/{rub['id']}", headers=me["h"]).json()["balance"] == 1_000_000 - 48_000
