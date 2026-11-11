"""Tests the money logic directly (no HTTP): the invariants, locking, immutability."""

import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from app.db.session import SessionLocal
from app.models import AccountType, LedgerEntry, Transfer, User
from app.services import accounts as account_service
from app.services import ledger
from app.services.errors import (
    AccountNotActive,
    IdempotencyConflict,
    InsufficientFunds,
    InvalidTransfer,
)


@pytest.fixture
def people(db):
    """Alice and Bob, each with a checking account; Alice is funded with $100."""
    users = []
    for email in ("alice@example.com", "bob@example.com"):
        u = User(email=email, password_hash="x", full_name=email.split("@")[0].title())
        db.add(u)
        db.flush()
        users.append(u)
    alice_acc = account_service.open_account(db, users[0].id, AccountType.CHECKING)
    bob_acc = account_service.open_account(db, users[1].id, AccountType.CHECKING)
    ledger.deposit(db, account_id=alice_acc.id, amount=10_000)
    db.commit()
    return users[0], users[1], alice_acc, bob_acc


def transfer(db, src, dst, amount, user, key=None):
    return ledger.post_transfer(
        db,
        from_account_id=src.id,
        to_account_id=dst.id,
        amount=amount,
        initiated_by=user.id,
        idempotency_key=key,
    )


def test_transfer_moves_money_with_two_cancelling_entries(db, people):
    alice, bob, a_acc, b_acc = people
    t = transfer(db, a_acc, b_acc, 2_000, alice)
    db.commit()

    assert ledger.get_balance(db, a_acc.id) == 8_000
    assert ledger.get_balance(db, b_acc.id) == 2_000
    entries = db.scalars(select(LedgerEntry).where(LedgerEntry.transfer_id == t.id)).all()
    assert sorted(e.amount for e in entries) == [-2_000, 2_000]
    assert ledger.verify_ledger(db) == []


def test_ledger_always_sums_to_zero_after_many_transfers(db, people):
    alice, bob, a_acc, b_acc = people
    for i in range(10):
        transfer(db, a_acc, b_acc, 100 + i, alice)
        transfer(db, b_acc, a_acc, 50 + i, bob)
    db.commit()
    assert db.scalar(select(func.sum(LedgerEntry.amount))) == 0
    assert ledger.verify_ledger(db) == []


def test_overdraft_is_refused_and_writes_nothing(db, people):
    alice, bob, a_acc, b_acc = people
    before = db.scalar(select(func.count()).select_from(LedgerEntry))
    with pytest.raises(InsufficientFunds):
        transfer(db, a_acc, b_acc, 10_001, alice)
    db.rollback()
    assert db.scalar(select(func.count()).select_from(LedgerEntry)) == before
    assert ledger.get_balance(db, a_acc.id) == 10_000


def test_can_spend_exact_balance(db, people):
    alice, bob, a_acc, b_acc = people
    transfer(db, a_acc, b_acc, 10_000, alice)
    db.commit()
    assert ledger.get_balance(db, a_acc.id) == 0


@pytest.mark.parametrize("amount", [0, -5])
def test_non_positive_amounts_refused(db, people, amount):
    alice, bob, a_acc, b_acc = people
    with pytest.raises(InvalidTransfer):
        transfer(db, a_acc, b_acc, amount, alice)


def test_cannot_transfer_to_same_account(db, people):
    alice, _, a_acc, _ = people
    with pytest.raises(InvalidTransfer):
        transfer(db, a_acc, a_acc, 100, alice)


def test_frozen_account_cannot_send_or_receive(db, people):
    alice, bob, a_acc, b_acc = people
    a_acc.status = "frozen"
    db.commit()
    with pytest.raises(AccountNotActive):
        transfer(db, a_acc, b_acc, 100, alice)
    db.rollback()
    with pytest.raises(AccountNotActive):
        transfer(db, b_acc, a_acc, 100, bob)


def test_idempotent_retry_moves_money_once(db, people):
    alice, _, a_acc, b_acc = people
    first = transfer(db, a_acc, b_acc, 2_000, alice, key="req-abc12345")
    db.commit()
    second = transfer(db, a_acc, b_acc, 2_000, alice, key="req-abc12345")
    db.commit()

    assert second.id == first.id
    assert ledger.get_balance(db, a_acc.id) == 8_000  # not 6_000
    assert db.scalar(select(func.count()).select_from(Transfer).where(Transfer.idempotency_key == "req-abc12345")) == 1


def test_same_key_with_different_payload_is_rejected(db, people):
    alice, _, a_acc, b_acc = people
    transfer(db, a_acc, b_acc, 2_000, alice, key="req-abc12345")
    db.commit()
    with pytest.raises(IdempotencyConflict):
        transfer(db, a_acc, b_acc, 3_000, alice, key="req-abc12345")


def test_same_key_from_different_users_does_not_collide(db, people):
    alice, bob, a_acc, b_acc = people
    transfer(db, a_acc, b_acc, 100, alice, key="shared-key-1")
    transfer(db, b_acc, a_acc, 100, bob, key="shared-key-1")
    db.commit()
    assert ledger.verify_ledger(db) == []


def test_ledger_entries_cannot_be_updated_or_deleted(db, people):
    entry_id = db.scalar(select(LedgerEntry.id).limit(1))
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text("UPDATE ledger_entries SET amount = 999999 WHERE id = :i"), {"i": entry_id})
    db.rollback()
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text("DELETE FROM ledger_entries WHERE id = :i"), {"i": entry_id})
    db.rollback()


def test_database_rejects_self_transfer_even_if_code_forgets(db, people):
    """The CHECK constraint is the safety net under the Python check."""
    _, _, a_acc, _ = people
    with pytest.raises(DBAPIError, match="ck_transfers_different_accounts"):
        db.execute(
            text(
                "INSERT INTO transfers (id, from_account_id, to_account_id, amount, currency) "
                "VALUES (gen_random_uuid(), :a, :a, 100, 'USD')"
            ),
            {"a": a_acc.id},
        )
    db.rollback()


# ---------------------------------------------------------------- concurrency

def test_double_spend_race_only_one_wins(db, people, monkeypatch):
    """Two simultaneous attempts to spend the ENTIRE balance. Row locking => exactly one succeeds.

    The sleep after reading the balance widens the race window so that, WITHOUT the
    lock, both threads would reliably read $100 before either writes. With the lock,
    the second thread simply waits its turn.
    """
    real_get_balance = ledger.get_balance

    def slow_get_balance(session, account_id):
        value = real_get_balance(session, account_id)
        time.sleep(0.3)
        return value

    monkeypatch.setattr(ledger, "get_balance", slow_get_balance)
    alice, bob, a_acc, b_acc = people
    a_id, b_id, alice_id = a_acc.id, b_acc.id, alice.id

    def attempt(key):
        with SessionLocal() as s:  # each thread = its own DB session/transaction
            try:
                ledger.post_transfer(
                    s, from_account_id=a_id, to_account_id=b_id, amount=10_000,
                    initiated_by=alice_id, idempotency_key=key,
                )
                s.commit()
                return "ok"
            except InsufficientFunds:
                s.rollback()
                return "insufficient"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ["race-key-0001", "race-key-0002"]))

    assert sorted(results) == ["insufficient", "ok"]
    db.expire_all()
    assert ledger.get_balance(db, a_id) == 0
    assert ledger.get_balance(db, b_id) == 10_000
    assert ledger.verify_ledger(db) == []


def test_identical_concurrent_requests_apply_once(db, people):
    """Same Idempotency-Key fired twice at once (a double tap): money moves once."""
    alice, bob, a_acc, b_acc = people
    a_id, b_id, alice_id = a_acc.id, b_acc.id, alice.id

    def attempt(_):
        with SessionLocal() as s:
            t = ledger.post_transfer(
                s, from_account_id=a_id, to_account_id=b_id, amount=2_000,
                initiated_by=alice_id, idempotency_key="double-tap-001",
            )
            s.commit()
            return t.id

    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(attempt, range(2)))

    assert ids[0] == ids[1]
    db.expire_all()
    assert ledger.get_balance(db, a_id) == 8_000


def test_opposite_direction_transfers_do_not_deadlock(db, people):
    """A->B and B->A at the same time, many times. Sorted lock order prevents deadlock."""
    alice, bob, a_acc, b_acc = people
    ids = (a_acc.id, b_acc.id, alice.id, bob.id)
    ledger.deposit(db, account_id=b_acc.id, amount=10_000)
    db.commit()

    def run(direction):
        a, b, au, bu = ids
        src, dst, who = (a, b, au) if direction == 0 else (b, a, bu)
        for _ in range(15):
            with SessionLocal() as s:
                ledger.post_transfer(
                    s, from_account_id=src, to_account_id=dst, amount=10,
                    initiated_by=who, idempotency_key=str(uuid.uuid4()),
                )
                s.commit()

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(run, [0, 1, 0, 1]))  # raises here if any thread deadlocked

    db.expire_all()
    assert ledger.verify_ledger(db) == []
    total = ledger.get_balance(db, ids[0]) + ledger.get_balance(db, ids[1])
    assert total == 20_000
