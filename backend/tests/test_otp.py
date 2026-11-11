"""One-time codes for larger payments, and the simulated SMS inbox."""

import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, text

from app.core.config import settings
from app.models import OtpChallenge, Transfer
from tests.conftest import TEST_PIN, register_and_login

BIG = 6_000  # above the $50.00 threshold
SMALL = 4_999  # one cent under it


def accounts_of(client, h):
    return client.get("/accounts", headers=h).json()


def fund(client, h, account_id, amount=100_000):
    assert client.post(f"/accounts/{account_id}/deposit", json={"amount": min(amount, 100_000)}, headers=h).status_code == 200


def pay(client, h, from_id, to_number, amount, key="key-00000001", otp=None, pin=TEST_PIN):
    body = {"from_account_id": from_id, "to_account_number": to_number, "amount": amount, "pin": pin}
    if otp is not None:
        body["otp"] = otp
    return client.post("/transfers", json=body, headers={**h, "Idempotency-Key": key})


def inbox(client, h):
    r = client.get("/sms/inbox", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def latest_code(client, h):
    return re.search(r"\b(\d{6})\b", inbox(client, h)[0]["body"]).group(1)


@pytest.fixture
def pair(client):
    a = register_and_login(client, "alice@example.com", "Alice Smith")
    b = register_and_login(client, "bob@example.com", "Bob Tester")
    a_acc, b_acc = accounts_of(client, a)[0], accounts_of(client, b)[0]
    fund(client, a, a_acc["id"])
    return {"a": a, "b": b, "a_id": a_acc["id"], "b_num": b_acc["account_number"], "b_id": b_acc["id"]}


def balance(client, h):
    return accounts_of(client, h)[0]["balance"]


# ---------------------------------------------------------------- when a code is needed

def test_small_payments_need_no_code(client, pair):
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], SMALL)
    assert r.status_code == 201
    assert inbox(client, pair["a"]) == []


def test_a_payment_at_the_threshold_asks_for_a_code_and_moves_nothing(client, pair):
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], 5_000)
    assert r.status_code == 428 and r.json()["code"] == "otp_required"
    assert "6-digit code" in r.json()["detail"]
    assert balance(client, pair["a"]) == 100_000
    assert len(inbox(client, pair["a"])) == 1


def test_the_text_mentions_the_amount_and_recipient(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    body = inbox(client, pair["a"])[0]["body"]
    assert "$60.00" in body and "Bob T." in body and "Never share" in body


def test_the_threshold_is_configurable(client, pair, monkeypatch):
    monkeypatch.setattr(settings, "otp_threshold_cents", 1_000_000)
    assert pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG).status_code == 201


# ---------------------------------------------------------------- using the code

def test_the_right_code_completes_the_payment(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=latest_code(client, pair["a"]))
    assert r.status_code == 201 and r.json()["new_balance"] == 100_000 - BIG
    assert balance(client, pair["b"]) == BIG


def test_a_code_works_once_only(client, pair, db):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    code = latest_code(client, pair["a"])
    assert pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=code).status_code == 201
    assert db.scalar(select(func.count()).select_from(OtpChallenge)) == 0  # consumed with the payment

    # The same code on a brand-new payment (new key) is worthless.
    again = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, key="key-00000002", otp=code)
    assert again.status_code == 403 and again.json()["code"] == "otp_expired"


def test_a_retry_of_a_finished_payment_returns_the_original(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    code = latest_code(client, pair["a"])
    first = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=code)
    retry = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=code)  # phone lost the first reply
    assert retry.status_code == 201 and retry.json()["id"] == first.json()["id"]
    assert balance(client, pair["a"]) == 100_000 - BIG  # charged once


def test_the_code_is_bound_to_that_exact_payment(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)  # code issued for $60
    code = latest_code(client, pair["a"])
    bigger = pay(client, pair["a"], pair["a_id"], pair["b_num"], 60_000, otp=code)  # same key, $600
    assert bigger.status_code == 403 and bigger.json()["code"] == "otp_expired"
    assert balance(client, pair["a"]) == 100_000


def test_a_wrong_code_is_counted_then_five_strikes_kill_it(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    right = latest_code(client, pair["a"])
    wrong = "000000" if right != "000000" else "111111"

    first = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=wrong)
    assert first.status_code == 403 and first.json()["code"] == "otp_invalid" and "4 attempts left" in first.json()["detail"]
    for _ in range(4):
        last = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=wrong)
    assert last.json()["code"] == "otp_expired"

    dead = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=right)  # even the right one is dead now
    assert dead.status_code == 403 and dead.json()["code"] == "otp_expired"
    assert balance(client, pair["a"]) == 100_000


def test_an_expired_code_is_refused(client, pair, db):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    code = latest_code(client, pair["a"])
    db.execute(text("UPDATE otp_challenges SET expires_at = :t"), {"t": datetime.now(timezone.utc) - timedelta(seconds=1)})
    db.commit()
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=code)
    assert r.status_code == 403 and r.json()["code"] == "otp_expired"


def test_asking_again_sends_a_new_code_and_retires_the_old_one(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    old = latest_code(client, pair["a"])
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)  # "resend"
    new = latest_code(client, pair["a"])
    assert len(inbox(client, pair["a"])) == 2
    if new != old:  # (1 in a million they collide)
        assert pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=old).status_code == 403
    assert pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=new).status_code == 201


def test_requesting_codes_is_rate_limited(client, pair):
    codes = [pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG).status_code for _ in range(6)]
    assert codes == [428] * 5 + [429]


def test_codes_are_never_stored_in_readable_form(client, pair, db):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    code = latest_code(client, pair["a"])
    stored = db.scalar(select(OtpChallenge.code_hash))
    assert stored != code and code not in stored and len(stored) == 64


# ---------------------------------------------------------------- ordering of checks

def test_a_wrong_pin_is_refused_before_any_code_is_sent(client, pair):
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, pin="908172")
    assert r.json()["code"] == "pin_invalid"
    assert inbox(client, pair["a"]) == []


def test_an_impossible_payment_does_not_text_you(client, pair):
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], 10_000_000)
    assert r.json()["code"] == "insufficient_funds"
    assert inbox(client, pair["a"]) == []


def test_a_failed_payment_keeps_the_code_usable(client, pair, db):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    code = latest_code(client, pair["a"])
    db.execute(text("UPDATE accounts SET status = 'frozen' WHERE id = :i"), {"i": pair["b_id"]})
    db.commit()
    assert pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=code).status_code == 422  # recipient frozen
    db.execute(text("UPDATE accounts SET status = 'active' WHERE id = :i"), {"i": pair["b_id"]})
    db.commit()
    assert pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=code).status_code == 201


def test_ledger_stays_consistent(client, pair, db):
    from app.services import ledger

    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG, otp=latest_code(client, pair["a"]))
    assert ledger.verify_ledger(db) == []
    assert db.scalar(select(func.count()).select_from(Transfer).where(Transfer.amount == BIG)) == 1


# ---------------------------------------------------------------- the simulated inbox

def test_the_inbox_is_private_and_newest_first(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    pay(client, pair["a"], pair["a_id"], pair["b_num"], 7_000, key="key-00000002")
    mine = inbox(client, pair["a"])
    assert [("$70.00" in m["body"]) for m in mine] == [True, False]
    assert inbox(client, pair["b"]) == []  # Bob sees nothing of Alice's codes


def test_the_inbox_needs_login_and_is_off_outside_demo_mode(client, pair, monkeypatch):
    assert client.get("/sms/inbox").status_code == 401
    monkeypatch.setattr(settings, "demo_mode", False)
    assert client.get("/sms/inbox", headers=pair["a"]).status_code == 404
    assert client.post(f"/accounts/{pair['a_id']}/deposit", json={"amount": 100}, headers=pair["a"]).status_code == 404


def test_the_text_reads_cleanly_with_no_doubled_punctuation(client, pair):
    pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    body = inbox(client, pair["a"])[0]["body"]
    assert ".." not in body
    assert body.endswith("Confirms $60.00 to Bob T. Never share this code.")


def test_a_user_without_a_phone_gets_no_empty_phone_parameter(client, pair, db):
    from sqlalchemy import update
    from app.models import User
    db.execute(update(User).where(User.email == "alice@example.com").values(phone=None))
    db.commit()
    r = pay(client, pair["a"], pair["a_id"], pair["b_num"], BIG)
    assert r.status_code == 428 and not (r.json().get("params") or {}).get("phone")
