"""The History tab's endpoint: every account, filters (account / card / period / direction), totals."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from tests.conftest import TEST_PIN, register_and_login


def utc_today():
    return datetime.now(timezone.utc).date()


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def fund(client, h, account_id, amount=100_000):
    assert client.post(f"/accounts/{account_id}/deposit", json={"amount": amount}, headers=h).status_code == 200


def history(client, h, **params):
    r = client.get("/history", params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def pay(client, h, from_id, to_number, amount, key, description=None):
    body = {"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": TEST_PIN}
    if description:
        body["description"] = description
    r = client.post("/transfers", json=body, headers={**h, "Idempotency-Key": key})
    assert r.status_code == 201, r.text


@pytest.fixture
def world(client):
    """Alice: checking ($1000) + savings. Bob: checking. Alice pays Bob, receives from Bob, moves money to savings,
    and owns two cards (one purchase each)."""
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_check = accounts_of(client, a)[0]
    b_check = accounts_of(client, b)[0]
    savings = client.post("/accounts", json={"type": "savings"}, headers=a).json()
    fund(client, a, a_check["id"])
    fund(client, b, b_check["id"])

    pay(client, a, a_check["id"], b_check["account_number"], 2_000, "key-00000001", "Lunch")   # out 20.00 (external)
    pay(client, b, b_check["id"], a_check["account_number"], 500, "key-00000002", "Refund")     # in 5.00 (external)
    pay(client, a, a_check["id"], savings["account_number"], 4_000, "key-00000003", "To savings")  # INTERNAL 40.00 (under the $50 code limit)

    card1 = client.post(f"/accounts/{a_check['id']}/cards", headers=a).json()
    card2 = client.post(f"/accounts/{a_check['id']}/cards", headers=a).json()
    client.post(f"/cards/{card1['id']}/purchase", json={"merchant": "Coffee House", "amount": 450}, headers=a)
    client.post(f"/cards/{card2['id']}/purchase", json={"merchant": "Bookshop", "amount": 1_200}, headers=a)
    return {"a": a, "b": b, "a_check": a_check, "b_check": b_check, "savings": savings, "card1": card1, "card2": card2}


# ---------------------------------------------------------------- the basics

def test_lists_every_account_newest_first_with_which_account_each_line_belongs_to(client, world):
    page = history(client, world["a"])
    ids = [i["id"] for i in page["items"]]
    assert ids == sorted(ids, reverse=True)
    accounts = {i["account_id"] for i in page["items"]}
    assert accounts == {world["a_check"]["id"], world["savings"]["id"]}  # lines from BOTH accounts
    first = page["items"][0]
    assert first["account_type"] == "checking" and first["account_number"] == world["a_check"]["account_number"]


def test_you_only_see_your_own_accounts_lines(client, world):
    mine = {i["account_id"] for i in history(client, world["b"])["items"]}
    assert mine == {world["b_check"]["id"]}


def test_a_card_purchase_names_its_card_and_counterparty(client, world):
    purchases = [i for i in history(client, world["a"])["items"] if i["card_id"]]
    assert {p["card_id"] for p in purchases} == {world["card1"]["id"], world["card2"]["id"]}
    assert all(p["counterparty_name"] == "Card payment" for p in purchases)


# ---------------------------------------------------------------- filters

def test_filter_by_account(client, world):
    only_savings = history(client, world["a"], account_id=world["savings"]["id"])["items"]
    assert [i["description"] for i in only_savings] == ["To savings"] and only_savings[0]["amount"] == 4_000


def test_filter_by_card_shows_only_that_cards_payments(client, world):
    c1 = history(client, world["a"], card_id=world["card1"]["id"])["items"]
    c2 = history(client, world["a"], card_id=world["card2"]["id"])["items"]
    assert [i["amount"] for i in c1] == [-450] and "Coffee House" in c1[0]["description"]
    assert [i["amount"] for i in c2] == [-1_200] and "Bookshop" in c2[0]["description"]


def test_filter_by_direction(client, world):
    incoming = history(client, world["a"], flow="in")["items"]
    outgoing = history(client, world["a"], flow="out")["items"]
    assert incoming and all(i["amount"] > 0 for i in incoming)
    assert outgoing and all(i["amount"] < 0 for i in outgoing)


def test_filter_by_period_is_inclusive_and_utc(client, world):
    today, tomorrow, yesterday = utc_today(), utc_today() + timedelta(days=1), utc_today() - timedelta(days=1)
    everything = history(client, world["a"])["totals"]["count"]
    assert history(client, world["a"], **{"from": str(today), "to": str(today)})["totals"]["count"] == everything
    assert history(client, world["a"], **{"from": str(tomorrow)})["totals"]["count"] == 0
    assert history(client, world["a"], **{"to": str(yesterday)})["totals"]["count"] == 0


def test_filters_combine(client, world):
    page = history(client, world["a"], account_id=world["a_check"]["id"], flow="out", **{"from": str(utc_today())})
    assert page["items"] and all(i["amount"] < 0 and i["account_id"] == world["a_check"]["id"] for i in page["items"])


# ---------------------------------------------------------------- totals

def test_totals_count_money_in_and_out_but_not_moves_between_your_own_accounts(client, world):
    t = history(client, world["a"])["totals"]
    # in: the $1000 demo deposit (from the bank) + $5.00 refund from Bob. NOT the $40 that moved to savings.
    usd = {c["currency"]: c for c in t["by_currency"]}["USD"]
    assert usd["income"] == 100_000 + 500
    # out: $20 to Bob + two card purchases $4.50 + $12.00. NOT the $40 that moved to savings.
    assert usd["spending"] == 2_000 + 450 + 1_200


def test_totals_cover_the_whole_filter_not_just_the_page(client, world):
    full = history(client, world["a"])["totals"]
    one_line = history(client, world["a"], limit=1)
    assert len(one_line["items"]) == 1 and one_line["totals"] == full


def test_totals_follow_the_filters(client, world):
    t = history(client, world["a"], card_id=world["card2"]["id"])["totals"]
    assert t == {"by_currency": [{"currency": "USD", "income": 0, "spending": 1_200}], "count": 1}


# ---------------------------------------------------------------- paging

def test_pagination_walks_every_line_exactly_once(client, world):
    total = history(client, world["a"])["totals"]["count"]
    seen, cursor = [], None
    for _ in range(20):
        params = {"limit": 3, **({"before": cursor} if cursor else {})}
        page = history(client, world["a"], **params)
        seen += [i["id"] for i in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == len(set(seen)) == total


# ---------------------------------------------------------------- access and validation

def test_other_peoples_accounts_and_cards_are_404(client, world):
    assert client.get("/history", params={"account_id": world["b_check"]["id"]}, headers=world["a"]).status_code == 404
    r = client.get("/history", params={"card_id": world["card1"]["id"]}, headers=world["b"])
    assert r.status_code == 404 and r.json()["code"] == "card_not_found"


def test_bad_requests_are_rejected(client, world):
    h = world["a"]
    assert client.get("/history", params={"limit": 0}, headers=h).status_code == 422
    assert client.get("/history", params={"limit": 101}, headers=h).status_code == 422
    assert client.get("/history", params={"flow": "sideways"}, headers=h).status_code == 422
    bad = client.get("/history", params={"from": "2026-12-31", "to": "2026-01-01"}, headers=h)
    assert bad.status_code == 400 and bad.json()["code"] == "bad_date_range"


def test_history_needs_login(client):
    assert client.get("/history").status_code == 401


# ---------------------------------------------------------------- the list of all cards

def test_cards_endpoint_lists_every_card_with_its_account(client, world):
    cards = client.get("/cards", headers=world["a"]).json()
    assert {c["id"] for c in cards} == {world["card1"]["id"], world["card2"]["id"]}
    assert all(c["account_type"] == "checking" and c["last4"] for c in cards)
    assert client.get("/cards", headers=world["b"]).json() == []  # Bob sees none of Alice's


def test_cards_endpoint_needs_login(client):
    assert client.get("/cards").status_code == 401


# ---------------------------------------------------------------- the migration's backfill

def test_the_backfill_links_old_purchases_to_their_card(client, world, db):
    """Purchases made BEFORE transfers.card_id existed only named the card in their description."""
    db.execute(text("UPDATE transfers SET card_id = NULL WHERE card_id IS NOT NULL"))
    db.commit()
    assert all(i["card_id"] is None for i in history(client, world["a"])["items"])

    # the same SQL the migration runs
    db.execute(
        text(
            """
            UPDATE transfers t SET card_id = c.id FROM cards c
            WHERE t.card_id IS NULL AND t.from_account_id = c.account_id
              AND t.description LIKE '%(card ••' || c.last4 || ')'
            """
        )
    )
    db.commit()
    assert len(history(client, world["a"], card_id=world["card1"]["id"])["items"]) == 1
    assert len(history(client, world["a"], card_id=world["card2"]["id"])["items"]) == 1
