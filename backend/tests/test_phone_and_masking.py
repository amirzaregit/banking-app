"""Pure-function tests: no database, no HTTP."""

import pytest

from app.services.phone import mask_name, mask_phone, normalize_phone
from app.services.ratelimit import RateLimiter


@pytest.mark.parametrize(
    "raw",
    ["+7 912 345-67-89", "8 (912) 345-67-89", "912 345 67 89", "+79123456789", "  +7(912)3456789 "],
)
def test_every_human_format_normalizes_to_the_same_number(raw):
    assert normalize_phone(raw) == "+79123456789"


def test_numbers_with_a_country_code_keep_it():
    assert normalize_phone("+1 202 555 0123") == "+12025550123"


@pytest.mark.parametrize("raw", ["", "abc", "12345", "+7 123", "99999999999999999999", "000"])
def test_garbage_is_rejected(raw):
    assert normalize_phone(raw) is None


@pytest.mark.parametrize(
    "full_name, masked",
    [
        ("Ivan Petrov", "Ivan P."),
        ("Ivan Ivanovich Petrov", "Ivan Ivanovich P."),
        ("Madonna", "Madonna"),
        ("  Ana   lee  ", "Ana L."),
    ],
)
def test_mask_name(full_name, masked):
    assert mask_name(full_name) == masked


def test_mask_phone_hides_the_middle():
    masked = mask_phone("+79123456789")
    assert masked == "+7••••••6789"
    assert "912345" not in masked


def test_rate_limiter_sliding_window():
    rl = RateLimiter()
    assert [rl.check("b", "u", 3, 10, now=t) for t in (0, 1, 2)] == [None, None, None]
    assert rl.check("b", "u", 3, 10, now=3) == pytest.approx(7)  # blocked until the t=0 hit expires
    assert rl.check("b", "u", 3, 10, now=10) is None  # t=0 hit has left the window
    # window now holds hits at t=1, 2, 10: full again, and the t=1 hit frees up at t=11
    assert rl.check("b", "u", 3, 10, now=10.5) == pytest.approx(0.5)


def test_rate_limiter_keeps_users_and_buckets_separate():
    rl = RateLimiter()
    assert rl.check("lookup", "alice", 1, 60, now=0) is None
    assert rl.check("lookup", "alice", 1, 60, now=1) is not None
    assert rl.check("lookup", "bob", 1, 60, now=1) is None  # different user
    assert rl.check("match", "alice", 1, 60, now=1) is None  # different bucket


def test_peek_never_records_but_record_does():
    rl = RateLimiter()
    for _ in range(10):
        assert rl.peek("b", "u", 2, 60, now=0) is None  # looking is free
    rl.record("b", "u", now=0)
    rl.record("b", "u", now=1)
    assert rl.peek("b", "u", 2, 60, now=2) == pytest.approx(58)  # now full; first hit frees at t=60
    assert rl.peek("b", "u", 2, 60, now=61) is None


def test_clear_forgets_a_key():
    rl = RateLimiter()
    rl.record("b", "u", now=0)
    rl.record("b", "u", now=0)
    rl.clear("b", "u")
    assert rl.peek("b", "u", 2, 60, now=1) is None


def test_idle_keys_do_not_pile_up_in_memory():
    rl = RateLimiter()
    for i in range(100):
        rl.check("b", f"user-{i}", 5, 10, now=0)
    rl.peek("b", "user-0", 5, 10, now=100)  # pruning happens when a key is looked at
    assert ("b", "user-0") not in rl._hits
