"""End-to-end tests through the HTTP API."""

from tests.conftest import TEST_PIN, register_and_login


def accounts_of(client, headers):
    r = client.get("/accounts", headers=headers)
    assert r.status_code == 200
    return r.json()


def fund(client, headers, account_id, amount):
    r = client.post(f"/accounts/{account_id}/deposit", json={"amount": amount}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def send(client, headers, from_id, to_number, amount, key="key-00000001", **extra):
    return client.post(
        "/transfers",
        json={"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": TEST_PIN, **extra},
        headers={**headers, "Idempotency-Key": key},
    )


def two_users(client):
    alice = register_and_login(client, "alice@example.com", "Alice")
    bob = register_and_login(client, "bob@example.com", "Bob")
    return alice, accounts_of(client, alice)[0], bob, accounts_of(client, bob)[0]


def test_register_creates_empty_checking_account(client):
    h = register_and_login(client, "alice@example.com", "Alice")
    [acc] = accounts_of(client, h)
    assert acc["type"] == "checking" and acc["balance"] == 0 and acc["currency"] == "USD"
    assert len(acc["account_number"]) == 10


def test_deposit_and_transfer_flow(client):
    a, a_acc, b, b_acc = two_users(client)
    assert fund(client, a, a_acc["id"], 10_000)["balance"] == 10_000

    r = send(client, a, a_acc["id"], b_acc["account_number"], 2_500, description="Pizza")
    assert r.status_code == 201, r.text
    assert r.json()["new_balance"] == 7_500

    assert accounts_of(client, a)[0]["balance"] == 7_500
    assert accounts_of(client, b)[0]["balance"] == 2_500


def test_history_shows_counterparty_and_running_balance(client):
    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 10_000)
    send(client, a, a_acc["id"], b_acc["account_number"], 2_500, description="Pizza")

    alice_hist = client.get(f"/accounts/{a_acc['id']}/transactions", headers=a).json()["items"]
    assert [(t["amount"], t["counterparty_name"], t["balance_after"]) for t in alice_hist] == [
        (-2_500, "Bob", 7_500),
        (10_000, "Bank", 10_000),
    ]
    assert alice_hist[0]["description"] == "Pizza"

    bob_hist = client.get(f"/accounts/{b_acc['id']}/transactions", headers=b).json()["items"]
    assert [(t["amount"], t["counterparty_name"]) for t in bob_hist] == [(2_500, "Alice")]


def test_history_pagination(client):
    a, a_acc, b, b_acc = two_users(client)
    for _ in range(5):
        fund(client, a, a_acc["id"], 100)
    url = f"/accounts/{a_acc['id']}/transactions"
    page1 = client.get(url, params={"limit": 2}, headers=a).json()
    assert len(page1["items"]) == 2 and page1["next_cursor"] is not None
    page2 = client.get(url, params={"limit": 2, "before": page1["next_cursor"]}, headers=a).json()
    ids = [t["id"] for t in page1["items"] + page2["items"]]
    assert len(set(ids)) == 4 and ids == sorted(ids, reverse=True)
    last = client.get(url, params={"limit": 2, "before": page2["next_cursor"]}, headers=a).json()
    assert len(last["items"]) == 1 and last["next_cursor"] is None


def test_overdraft_returns_422_and_balance_unchanged(client):
    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 1_000)
    r = send(client, a, a_acc["id"], b_acc["account_number"], 1_001)
    assert r.status_code == 422 and r.json()["detail"] == "Insufficient funds"
    assert accounts_of(client, a)[0]["balance"] == 1_000


def test_retry_with_same_idempotency_key_returns_same_transfer(client):
    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 10_000)
    r1 = send(client, a, a_acc["id"], b_acc["account_number"], 2_000, key="retry-key-0001")
    r2 = send(client, a, a_acc["id"], b_acc["account_number"], 2_000, key="retry-key-0001")
    assert r1.status_code == r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    assert accounts_of(client, a)[0]["balance"] == 8_000  # charged once


def test_same_key_different_amount_is_rejected(client):
    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 10_000)
    send(client, a, a_acc["id"], b_acc["account_number"], 2_000, key="retry-key-0001")
    r = send(client, a, a_acc["id"], b_acc["account_number"], 3_000, key="retry-key-0001")
    assert r.status_code == 422


def test_idempotency_key_header_is_required(client):
    a, a_acc, b, b_acc = two_users(client)
    r = client.post(
        "/transfers",
        json={"from_account_id": a_acc["id"], "to_account_number": b_acc["account_number"], "amount": 1},
        headers=a,
    )
    assert r.status_code == 422


def test_cannot_spend_from_someone_elses_account(client):
    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 5_000)
    r = send(client, b, a_acc["id"], b_acc["account_number"], 1_000)  # Bob uses Alice's account id
    assert r.status_code == 404
    assert accounts_of(client, a)[0]["balance"] == 5_000


def test_cannot_read_or_fund_someone_elses_account(client):
    a, a_acc, b, b_acc = two_users(client)
    assert client.get(f"/accounts/{a_acc['id']}", headers=b).status_code == 404
    assert client.get(f"/accounts/{a_acc['id']}/transactions", headers=b).status_code == 404
    r = client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 100}, headers=b)
    assert r.status_code == 404


def test_unknown_recipient_and_system_account_are_not_found(client):
    a, a_acc, _, _ = two_users(client)
    fund(client, a, a_acc["id"], 1_000)
    assert send(client, a, a_acc["id"], "0000000000", 100).status_code == 404
    assert send(client, a, a_acc["id"], "SYSTEM-RESERVE-USD", 100).status_code == 404


def test_transfer_to_own_other_account_and_to_self(client):
    a = register_and_login(client, "alice@example.com", "Alice")
    [checking] = accounts_of(client, a)
    savings = client.post("/accounts", json={"type": "savings"}, headers=a).json()
    fund(client, a, checking["id"], 5_000)

    assert send(client, a, checking["id"], savings["account_number"], 2_000).status_code == 201
    assert send(client, a, checking["id"], checking["account_number"], 100, key="key-00000002").status_code == 422
    balances = {x["type"]: x["balance"] for x in accounts_of(client, a)}
    assert balances == {"checking": 3_000, "savings": 2_000}


def test_amount_validation(client):
    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 1_000)
    for bad in (0, -5, 10**12):
        assert send(client, a, a_acc["id"], b_acc["account_number"], bad, key=f"bad-key-{abs(bad)%99:04d}").status_code == 422
    assert client.post(f"/accounts/{a_acc['id']}/deposit", json={"amount": 100_001}, headers=a).status_code == 422


def test_account_limit(client):
    a = register_and_login(client, "alice@example.com", "Alice")  # already has 1
    for _ in range(7):  # the limit is 8 accounts in total, of any currency
        assert client.post("/accounts", json={"type": "savings"}, headers=a).status_code == 201
    assert client.post("/accounts", json={"type": "savings"}, headers=a).status_code == 422


def test_endpoints_require_auth(client):
    assert client.get("/accounts").status_code == 401
    assert client.post("/transfers", json={}).status_code == 401


def test_ledger_stays_consistent_after_everything(client, db):
    from app.services import ledger

    a, a_acc, b, b_acc = two_users(client)
    fund(client, a, a_acc["id"], 10_000)
    send(client, a, a_acc["id"], b_acc["account_number"], 1_234, key="key-aaaaaaaa")
    send(client, b, b_acc["id"], a_acc["account_number"], 234, key="key-bbbbbbbb")
    assert ledger.verify_ledger(db) == []
