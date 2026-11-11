"""One transaction in full: its kind, the other side, the receipt number, and who may see it."""

import pytest

from app.services import rates as rates_service
from tests.conftest import TEST_PIN, register_and_login

RATES = {"USD": 1.0, "RUB": 80.0, "IRR": 1_600_000.0, "AED": 3.6725, "EUR": 0.9, "CNY": 7.2, "JPY": 150.0}


@pytest.fixture(autouse=True)
def fixed_rates(monkeypatch):
    snapshot = rates_service.Snapshot("USD", RATES, "2026-10-30T00:00:00+00:00", "test")
    monkeypatch.setattr(rates_service, "get_rates", lambda now=None: (snapshot, False))


@pytest.fixture
def world(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Jones")
    a_acc = client.get("/accounts", headers=a).json()[0]
    b_acc = client.get("/accounts", headers=b).json()[0]
    assert client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 50_000}, headers=a).status_code == 200
    return {"a": a, "b": b, "a_acc": a_acc, "b_acc": b_acc}


def lines(client, h):
    return client.get("/history?limit=100", headers=h).json()["items"]


def detail(client, h, entry_id):
    return client.get(f"/transactions/{entry_id}", headers=h)


def send(client, w, amount=1_000, key="trx-key-0001", **extra):
    r = client.post("/transfers", json={"from_account_id": w["a_acc"]["id"], "to_account_number": w["b_acc"]["account_number"], "amount": amount, "pin": TEST_PIN, **extra}, headers={**w["a"], "Idempotency-Key": key})
    assert r.status_code == 201, r.text
    return r.json()


def test_a_deposit_is_a_deposit_from_the_bank(client, world):
    d = detail(client, world["a"], lines(client, world["a"])[0]["id"]).json()
    assert d["kind"] == "deposit" and d["amount"] == 50_000 and d["counterparty_name"] == "Bank"
    assert d["receipt_number"].startswith("RCP-") and d["status"] == "completed"


def test_a_transfer_shows_both_sides_with_the_same_receipt_number(client, world):
    send(client, world, 1_000)
    mine = detail(client, world["a"], next(x["id"] for x in lines(client, world["a"]) if x["amount"] == -1_000)).json()
    theirs = detail(client, world["b"], next(x["id"] for x in lines(client, world["b"]) if x["amount"] == 1_000)).json()
    assert mine["kind"] == theirs["kind"] == "transfer"
    assert mine["counterparty_name"] == "Bob Jones" and theirs["counterparty_name"] == "Alice Smith"
    assert mine["amount"] == -1_000 and theirs["amount"] == 1_000
    assert mine["receipt_number"] == theirs["receipt_number"]  # one payment, one reference
    assert mine["account_number"] == world["a_acc"]["account_number"]


def test_a_gift_is_a_gift_with_its_design(client, world):
    send(client, world, 1_000, key="trx-key-0002", gift_design="birthday", description="Happy birthday")
    d = detail(client, world["a"], next(x["id"] for x in lines(client, world["a"]) if x["amount"] == -1_000)).json()
    assert d["kind"] == "gift" and d["gift_design"] == "birthday" and d["description"] == "Happy birthday"


def test_a_card_payment_names_the_card(client, world):
    card = client.post(f"/accounts/{world['a_acc']['id']}/cards", headers=world["a"]).json()
    assert client.post(f"/cards/{card['id']}/purchase", json={"merchant": "Coffee House", "amount": 450}, headers=world["a"]).status_code == 200
    d = detail(client, world["a"], next(x["id"] for x in lines(client, world["a"]) if x["amount"] == -450)).json()
    assert d["kind"] == "card_payment" and d["card_last4"] == card["last4"]


def test_a_bill_payment_names_the_provider(client, world):
    rub = client.post("/accounts", json={"type": "checking", "currency": "RUB"}, headers=world["a"]).json()
    client.post(f"/accounts/{rub['id']}/deposit", json={"amount": 300_000}, headers=world["a"])
    r = client.post("/bills/pay", json={"provider_id": "mts", "reference": "+79123456789", "from_account_id": rub["id"], "amount": 50_000, "pin": TEST_PIN}, headers={**world["a"], "Idempotency-Key": "trx-key-0003"})
    assert r.status_code == 201, r.text
    entry = next(x for x in lines(client, world["a"]) if x["amount"] == -50_000)
    d = detail(client, world["a"], entry["id"]).json()
    assert d["kind"] == "bill" and d["provider_id"] == "mts" and d["currency"] == "RUB"


def test_an_insurance_payment_is_insurance(client, world):
    from datetime import timedelta
    from app.services import insurance
    body = {"product": "travel", "plan": "basic", "start_date": (insurance.today() + timedelta(days=1)).isoformat(), "end_date": (insurance.today() + timedelta(days=5)).isoformat(),
            "region": "cis", "travelers": 1, "account_id": world["a_acc"]["id"], "pin": TEST_PIN}
    assert client.post("/insurance/policies", json=body, headers={**world["a"], "Idempotency-Key": "trx-key-0004"}).status_code == 201
    entry = next(x for x in lines(client, world["a"]) if x["amount"] == -600)
    d = detail(client, world["a"], entry["id"]).json()
    assert d["kind"] == "insurance" and d["provider_id"] == "insurance_travel" and d["description"].startswith("Insurance INS-")


def test_an_exchange_has_the_rate_and_the_other_currencys_amount(client, world):
    rub = client.post("/accounts", json={"type": "checking", "currency": "RUB"}, headers=world["a"]).json()
    r = client.post("/conversions", json={"from_account_id": world["a_acc"]["id"], "to_account_id": rub["id"], "amount": 3_000, "expected_to_amount": 240_000, "pin": TEST_PIN}, headers={**world["a"], "Idempotency-Key": "trx-key-0005"})
    assert r.status_code == 201, r.text
    out = detail(client, world["a"], next(x["id"] for x in lines(client, world["a"]) if x["amount"] == -3_000)).json()
    inn = detail(client, world["a"], next(x["id"] for x in lines(client, world["a"]) if x["amount"] == 240_000)).json()
    assert out["kind"] == inn["kind"] == "exchange"
    assert out["exchange"] == {"rate": 80.0, "other_amount": 240_000, "other_currency": "RUB"}
    assert inn["exchange"]["other_amount"] == 3_000 and inn["exchange"]["other_currency"] == "USD"


def test_someone_elses_line_is_a_404_and_a_missing_one_too(client, world):
    send(client, world, 1_000, key="trx-key-0006")
    alice_line = lines(client, world["a"])[0]["id"]
    third = register_and_login(client, "carol@example.com", "Carol Lee")
    assert detail(client, third, alice_line).status_code == 404
    assert detail(client, world["a"], 99_999_999).status_code == 404
    assert client.get("/transactions/1").status_code == 401


def test_the_kind_rules_in_isolation():
    from types import SimpleNamespace
    from app.services.transactions import classify
    T = lambda **k: SimpleNamespace(**{"conversion_id": None, "service_provider": None, "card_id": None, "gift_design": None, "description": None, **k})
    assert classify(T(conversion_id="x"), "SYSTEM-FX-USD") == "exchange"
    assert classify(T(service_provider="insurance_car"), "SYSTEM-SERVICES-USD") == "insurance"
    assert classify(T(service_provider="mts"), "SYSTEM-SERVICES-RUB") == "bill"
    assert classify(T(), "SYSTEM-MERCHANTS-USD") == "card_payment"
    assert classify(T(description="Top-up (card)"), "SYSTEM-RESERVE-USD") == "top_up"
    assert classify(T(description="Demo deposit"), "SYSTEM-RESERVE-USD") == "deposit"
    assert classify(T(gift_design="wedding"), "40817810000000000001") == "gift"
    assert classify(T(), "40817810000000000001") == "transfer"
