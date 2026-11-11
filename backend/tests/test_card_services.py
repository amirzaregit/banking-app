"""Ordering a plastic card, and blocking accounts and cards."""

import pytest

from tests.conftest import TEST_PIN, register_and_login


@pytest.fixture
def me(client):
    h = register_and_login(client, "alice@example.com", "Alice Smith")
    acc = client.get("/accounts", headers=h).json()[0]
    assert client.post(f"/accounts/{acc['id']}/deposit", json={"amount": 10_000}, headers=h).status_code == 200
    card = client.post(f"/accounts/{acc['id']}/cards", headers=h).json()
    return {"h": h, "acc": acc, "card": card}


def order(client, me, **over):
    body = {"theme": "dark", "branch_id": "arbat", "notify_by": "app", **over}
    return client.post(f"/accounts/{me['acc']['id']}/card-orders", json=body, headers=me["h"])


def kinds(client, h):
    return [n["kind"] for n in client.get("/notifications", headers=h).json()["items"]]


# ---------------------------------------------------------------- physical card

def test_ordering_a_card_is_pending_and_notifies(client, me):
    r = order(client, me)
    assert r.status_code == 201
    assert r.json()["status"] == "pending"
    assert "card_order_placed" in kinds(client, me["h"])
    listed = client.get(f"/accounts/{me['acc']['id']}/card-orders", headers=me["h"]).json()
    assert [o["status"] for o in listed] == ["pending"]


def test_second_order_while_one_is_pending_is_refused(client, me):
    assert order(client, me).status_code == 201
    r = order(client, me, theme="light")
    assert r.status_code == 409
    assert r.json()["code"] == "card_order_pending"


def test_a_new_order_is_possible_once_the_first_is_ready(client, me):
    first = order(client, me).json()
    assert client.post(f"/card-orders/{first['id']}/demo-ready", headers=me["h"]).json()["status"] == "ready"
    assert "card_order_ready" in kinds(client, me["h"])
    assert order(client, me).status_code == 201


def test_unknown_branch_and_theme_are_refused(client, me):
    assert order(client, me, branch_id="nowhere").json()["code"] == "unknown_branch"
    assert order(client, me, theme="neon").status_code == 422


def test_cannot_order_for_someone_elses_account(client, me):
    other = register_and_login(client, "bob@example.com", "Bob Jones")
    r = client.post(f"/accounts/{me['acc']['id']}/card-orders", json={"theme": "dark", "branch_id": "arbat"}, headers=other)
    assert r.status_code == 404


# ---------------------------------------------------------------- blocking a card

def block_card(client, me, reason, details=None):
    return client.post(f"/cards/{me['card']['id']}/block", json={"reason": reason, "details": details}, headers=me["h"])


def card_status(client, me):
    return client.get(f"/accounts/{me['acc']['id']}/cards", headers=me["h"]).json()[0]["status"]


@pytest.mark.parametrize("reason", ["lost", "stolen", "swallowed_by_atm", "damaged", "fraud_suspected"])
def test_ready_made_reason_blocks_the_card_at_once(client, me, reason):
    r = block_card(client, me, reason)
    assert r.status_code == 201 and r.json()["status"] == "applied"
    assert card_status(client, me) == "blocked"
    assert "card_blocked" in kinds(client, me["h"])


def test_a_blocked_card_declines_purchases_and_cannot_be_unfrozen(client, me):
    block_card(client, me, "stolen")
    r = client.post(f"/cards/{me['card']['id']}/purchase", json={"merchant": "Shop", "amount": 500}, headers=me["h"])
    assert r.status_code == 422 and r.json()["params"] == {"reason": "blocked"}
    assert client.post(f"/cards/{me['card']['id']}/unfreeze", headers=me["h"]).json()["code"] == "card_blocked"
    assert block_card(client, me, "lost").json()["code"] == "already_blocked"


def test_free_text_reason_waits_for_a_specialist(client, me):
    r = block_card(client, me, "other", "Something odd happened with this card yesterday")
    assert r.json()["status"] == "pending_review"
    assert card_status(client, me) == "active"  # nothing is blocked yet
    assert block_card(client, me, "other", "Please do it quickly now").json()["code"] == "block_pending"

    done = client.post(f"/block-requests/{r.json()['id']}/demo-review", json={"approve": True}, headers=me["h"]).json()
    assert done["status"] == "approved"
    assert card_status(client, me) == "blocked"


def test_rejected_review_leaves_the_card_alone(client, me):
    r = block_card(client, me, "other", "I just do not like this card anymore").json()
    assert client.post(f"/block-requests/{r['id']}/demo-review", json={"approve": False}, headers=me["h"]).json()["status"] == "rejected"
    assert card_status(client, me) == "active"
    assert "block_rejected" in kinds(client, me["h"])
    # a decided request cannot be decided again
    assert client.post(f"/block-requests/{r['id']}/demo-review", json={"approve": True}, headers=me["h"]).json()["code"] == "already_reviewed"


def test_free_text_needs_a_real_explanation(client, me):
    assert block_card(client, me, "other").json()["code"] == "details_required"
    assert block_card(client, me, "other", "short").json()["code"] == "details_required"
    assert block_card(client, me, "aliens").json()["code"] == "unknown_reason"


def test_cannot_block_someone_elses_card(client, me):
    other = register_and_login(client, "bob@example.com", "Bob Jones")
    assert client.post(f"/cards/{me['card']['id']}/block", json={"reason": "lost"}, headers=other).status_code == 404


# ---------------------------------------------------------------- blocking an account

def block_account(client, me, reason="not_using", details=None):
    return client.post(f"/accounts/{me['acc']['id']}/block", json={"reason": reason, "details": details}, headers=me["h"])


def account_status(client, me):
    return client.get(f"/accounts/{me['acc']['id']}", headers=me["h"]).json()["status"]


def test_blocking_an_account_stops_payments_and_can_be_undone_with_the_pin(client, me):
    assert block_account(client, me, "fraud_suspected").json()["status"] == "applied"
    assert account_status(client, me) == "frozen"
    other = register_and_login(client, "bob@example.com", "Bob Jones")
    bob = client.get("/accounts", headers=other).json()[0]
    pay = client.post("/transfers", headers={**me["h"], "Idempotency-Key": "k-1"},
                      json={"from_account_id": me["acc"]["id"], "to_account_number": bob["account_number"], "amount": 100, "pin": TEST_PIN})
    assert pay.status_code == 422

    assert client.post(f"/accounts/{me['acc']['id']}/unblock", json={"pin": "000111"}, headers=me["h"]).status_code == 403
    assert account_status(client, me) == "frozen"
    assert client.post(f"/accounts/{me['acc']['id']}/unblock", json={"pin": TEST_PIN}, headers=me["h"]).status_code == 204
    assert account_status(client, me) == "active"


def test_blocking_twice_and_unblocking_an_active_account_are_refused(client, me):
    block_account(client, me)
    assert block_account(client, me).json()["code"] == "already_blocked"
    client.post(f"/accounts/{me['acc']['id']}/unblock", json={"pin": TEST_PIN}, headers=me["h"])
    assert client.post(f"/accounts/{me['acc']['id']}/unblock", json={"pin": TEST_PIN}, headers=me["h"]).json()["code"] == "not_blocked"


def test_account_free_text_reason_needs_approval(client, me):
    r = block_account(client, me, "other", "I am travelling and want it locked meanwhile").json()
    assert r["status"] == "pending_review" and account_status(client, me) == "active"
    listed = client.get(f"/accounts/{me['acc']['id']}/block-requests", headers=me["h"]).json()
    assert [x["status"] for x in listed] == ["pending_review"]
    client.post(f"/block-requests/{r['id']}/demo-review", json={"approve": True}, headers=me["h"])
    assert account_status(client, me) == "frozen"
