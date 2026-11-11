"""Exchange rates: two sources, a one-hour cache, and a stale fallback. The real network is never touched."""

import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.core.config import settings
from app.services import rates as rates_service
from app.services.rates import CURRENCIES, RatesUnavailable
from tests.conftest import register_and_login

PRIMARY = "open.er-api.com"
BACKUP = "jsdelivr"


def primary_payload(**overrides):
    rates = {"USD": 1, "RUB": 80.5, "IRR": 1_780_000, "AED": 3.6725, "EUR": 0.896, "CNY": 6.68, "JPY": 157.9, **overrides}
    return {"result": "success", "time_last_update_unix": 1_790_000_000, "rates": rates}


def backup_payload():
    return {"date": "2026-10-30", "usd": {"rub": 81.0, "irr": 1_800_000, "aed": 3.67, "eur": 0.9, "cny": 6.7, "jpy": 158.0}}


class FakeNetwork:
    """Replaces the one function that touches the network, and counts the calls."""

    def __init__(self, primary, backup):
        self.primary, self.backup, self.calls = primary, backup, []

    def __call__(self, url):
        self.calls.append("primary" if PRIMARY in url else "backup")
        answer = self.primary if PRIMARY in url else self.backup
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def network(monkeypatch):
    fake = FakeNetwork(primary_payload(), backup_payload())
    monkeypatch.setattr(rates_service, "_http_get_json", fake)
    return fake


# ---------------------------------------------------------------- the sources

def test_the_primary_source_gives_all_seven_currencies(network):
    snap, stale = rates_service.get_rates()
    assert not stale and snap.source == "ExchangeRate-API" and snap.base == "USD"
    assert set(snap.rates) == set(CURRENCIES) == {"USD", "RUB", "IRR", "AED", "EUR", "CNY", "JPY"}
    assert snap.rates["USD"] == 1.0 and snap.rates["RUB"] == 80.5
    assert network.calls == ["primary"]


def test_falls_back_when_the_primary_is_down(network):
    network.primary = ConnectionError("down")
    snap, _ = rates_service.get_rates()
    assert snap.source == "currency-api" and snap.rates["RUB"] == 81.0 and snap.rates["USD"] == 1.0
    assert network.calls == ["primary", "backup"]


def test_falls_back_when_the_primary_is_missing_a_currency(network):
    payload = primary_payload()
    del payload["rates"]["AED"]
    network.primary = payload
    assert rates_service.get_rates()[0].source == "currency-api"


def test_falls_back_when_the_primary_reports_failure(network):
    network.primary = {"result": "error", "error-type": "quota-reached"}
    assert rates_service.get_rates()[0].source == "currency-api"


@pytest.mark.parametrize("bad", [0, -1])
def test_a_zero_or_negative_rate_is_rejected_as_garbage(network, bad):
    network.primary = primary_payload(RUB=bad)
    assert rates_service.get_rates()[0].source == "currency-api"


def test_everything_down_and_nothing_cached_is_a_clear_error(network):
    network.primary = network.backup = TimeoutError("down")
    with pytest.raises(RatesUnavailable):
        rates_service.get_rates()


# ---------------------------------------------------------------- the cache

def test_a_second_request_inside_the_window_costs_no_outside_call(network):
    rates_service.get_rates(now=1000.0)
    rates_service.get_rates(now=1000.0 + settings.rates_cache_seconds - 1)
    assert network.calls == ["primary"]


def test_after_the_window_the_rates_are_refreshed(network):
    rates_service.get_rates(now=1000.0)
    network.primary = primary_payload(RUB=99.0)
    snap, stale = rates_service.get_rates(now=1000.0 + settings.rates_cache_seconds + 1)
    assert snap.rates["RUB"] == 99.0 and not stale and len(network.calls) == 2


def test_if_the_refresh_fails_the_last_good_rates_are_served_and_marked_stale(network):
    rates_service.get_rates(now=1000.0)
    network.primary = network.backup = ConnectionError("down")
    snap, stale = rates_service.get_rates(now=1000.0 + settings.rates_cache_seconds + 1)
    assert stale is True and snap.rates["RUB"] == 80.5


def test_simultaneous_requests_cause_only_one_outside_call(monkeypatch):
    calls = []

    def slow(url):
        calls.append(url)
        time.sleep(0.2)  # long enough that all the threads arrive while the first is fetching
        return primary_payload()

    monkeypatch.setattr(rates_service, "_http_get_json", slow)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: rates_service.get_rates(), range(8)))
    assert len(calls) == 1 and all(not stale for _, stale in results)


# ---------------------------------------------------------------- the API

def test_the_endpoint_returns_the_rates_for_a_signed_in_user(client, network):
    h = register_and_login(client, "a@example.com", "Alice Smith")
    r = client.get("/rates", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["base"] == "USD" and body["stale"] is False and body["source"] == "ExchangeRate-API"
    assert set(body["rates"]) == set(CURRENCIES) and body["updated_at"].startswith("2026-")


def test_the_endpoint_reports_503_with_a_code_when_nothing_works(client, network):
    h = register_and_login(client, "a@example.com", "Alice Smith")
    network.primary = network.backup = ConnectionError("down")
    r = client.get("/rates", headers=h)
    assert r.status_code == 503 and r.json()["code"] == "rates_unavailable"


def test_the_endpoint_needs_login(client, network):
    assert client.get("/rates").status_code == 401
    assert network.calls == []  # and an anonymous request never triggers an outside call
