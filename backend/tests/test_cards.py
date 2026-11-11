"""Virtual cards: issuing, freezing, and what a frozen card can and can't do."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models import LedgerEntry
from app.services import ledger
from tests.conftest import TEST_PIN, register_and_login


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def fund(client, h, account_id, amount=10_000):
    assert client.post(f"/accounts/{account_id}/deposit", json={"amount": amount}, headers=h).status_code == 200


@pytest.fixture
def me(client):
    h = register_and_login(client, "alice@example.com", "Alice Smith")
    acc = accounts_of(client, h)[0]
    fund(client, h, acc["id"])
    card = client.post(f"/accounts/{acc['id']}/cards", headers=h).json()
    return {"h": h, "acc": acc, "card": card}


def purchase(client, h, card_id, amount=450, merchant="Coffee House"):
    return client.post(f"/cards/{card_id}/purchase", json={"merchant": merchant, "amount": amount}, headers=h)


# ---------------------------------------------------------------- issuing

def test_a_new_card_is_active_with_only_the_last_four_digits(client, me):
    card = me["card"]
    assert card["status"] == "active" and len(card["last4"]) == 4 and card["last4"].isdigit()
    month, year = card["expiry"].split("/")
    assert 1 <= int(month) <= 12 and int(year) >= datetime.now(timezone.utc).year % 100 + 2
    assert set(card) == {"id", "account_id", "last4", "expiry", "status", "created_at"}  # no full number anywhere


def test_list_and_the_three_card_limit(client, me):
    h, acc_id = me["h"], me["acc"]["id"]
    assert len(client.get(f"/accounts/{acc_id}/cards", headers=h).json()) == 1
    for _ in range(2):
        assert client.post(f"/accounts/{acc_id}/cards", headers=h).status_code == 201
    r = client.post(f"/accounts/{acc_id}/cards", headers=h)
    assert r.status_code == 400 and r.json()["code"] == "card_limit"


def test_cards_of_other_people_are_invisible(client, me):
    other = register_and_login(client, "bob@example.com", "Bob Tester")
    assert client.get(f"/accounts/{me['acc']['id']}/cards", headers=other).status_code == 404
    assert client.post(f"/accounts/{me['acc']['id']}/cards", headers=other).status_code == 404
    for action in ("freeze", "unfreeze"):
        assert client.post(f"/cards/{me['card']['id']}/{action}", headers=other).status_code == 404
    assert purchase(client, other, me["card"]["id"]).status_code == 404


def test_cards_require_login(client, me):
    assert client.get(f"/accounts/{me['acc']['id']}/cards").status_code == 401
    assert client.post(f"/cards/{me['card']['id']}/freeze").status_code == 401


# ---------------------------------------------------------------- freezing

def test_freeze_and_unfreeze_round_trip_and_are_idempotent(client, me):
    cid, h = me["card"]["id"], me["h"]
    assert client.post(f"/cards/{cid}/freeze", headers=h).json()["status"] == "frozen"
    assert client.post(f"/cards/{cid}/freeze", headers=h).json()["status"] == "frozen"  # again: still fine
    assert client.post(f"/cards/{cid}/unfreeze", headers=h).json()["status"] == "active"


def test_a_frozen_card_is_declined_and_writes_nothing(client, me, db):
    client.post(f"/cards/{me['card']['id']}/freeze", headers=me["h"])
    before = db.scalar(select(func.count()).select_from(LedgerEntry))
    r = purchase(client, me["h"], me["card"]["id"])
    assert r.status_code == 422 and r.json()["code"] == "card_declined" and "frozen" in r.json()["detail"]
    assert accounts_of(client, me["h"])[0]["balance"] == 10_000
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(LedgerEntry)) == before  # a decline leaves no trace


def test_unfreezing_makes_purchases_work_again(client, me):
    cid, h = me["card"]["id"], me["h"]
    client.post(f"/cards/{cid}/freeze", headers=h)
    assert purchase(client, h, cid).status_code == 422
    client.post(f"/cards/{cid}/unfreeze", headers=h)
    assert purchase(client, h, cid).status_code == 200


def test_freezing_a_card_does_not_freeze_the_account(client, me):
    """The card is a key; the account is the vault. Transfers still work."""
    other = register_and_login(client, "bob@example.com", "Bob Tester")
    other_acc = accounts_of(client, other)[0]
    client.post(f"/cards/{me['card']['id']}/freeze", headers=me["h"])
    r = client.post(
        "/transfers",
        json={"from_account_id": me["acc"]["id"], "to_account_number": other_acc["account_number"], "amount": 1_000, "pin": TEST_PIN},
        headers={**me["h"], "Idempotency-Key": "key-00000001"},
    )
    assert r.status_code == 201


# ---------------------------------------------------------------- purchases

def test_an_approved_purchase_debits_and_shows_in_history(client, me, db):
    r = purchase(client, me["h"], me["card"]["id"], 450, "Coffee House")
    assert r.status_code == 200 and r.json()["approved"] is True and r.json()["new_balance"] == 9_550

    history = client.get(f"/accounts/{me['acc']['id']}/transactions", headers=me["h"]).json()["items"]
    top = history[0]
    assert top["amount"] == -450 and top["counterparty_name"] == "Card payment"
    assert "Coffee House" in top["description"] and f"••{me['card']['last4']}" in top["description"]
    assert ledger.verify_ledger(db) == []  # a card purchase is still a balanced double entry


def test_a_purchase_over_the_balance_is_declined(client, me):
    r = purchase(client, me["h"], me["card"]["id"], 100_000)
    assert r.status_code == 422 and "insufficient" in r.json()["detail"].lower()
    assert accounts_of(client, me["h"])[0]["balance"] == 10_000


def test_a_purchase_on_a_frozen_account_is_declined(client, me, db):
    db.execute(text("UPDATE accounts SET status = 'frozen' WHERE id = :i"), {"i": me["acc"]["id"]})
    db.commit()
    assert purchase(client, me["h"], me["card"]["id"]).status_code == 422


@pytest.mark.parametrize("body", [{"merchant": "", "amount": 100}, {"merchant": "X", "amount": 0}, {"merchant": "X", "amount": 100_001}])
def test_purchase_validation(client, me, body):
    assert client.post(f"/cards/{me['card']['id']}/purchase", json=body, headers=me["h"]).status_code == 422


def test_the_simulator_is_off_outside_demo_mode(client, me, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", False)
    assert purchase(client, me["h"], me["card"]["id"]).status_code == 404


def test_the_database_rejects_a_bogus_card_status(client, me, db):
    with pytest.raises(IntegrityError, match="ck_cards_status"):
        db.execute(text("UPDATE cards SET status = 'stolen'"))
        db.commit()
    db.rollback()
