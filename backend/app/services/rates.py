"""Currency exchange rates from free public APIs, cached on the server.

Why the SERVER fetches them (not each phone): one outside call per hour no matter how many users, one place
to add a fallback source, and the free APIs never see our users' addresses.
"""

import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.services.errors import DomainError

# The currencies the app shows: Russian ruble, US dollar, Iranian rial, UAE dirham, euro, Chinese yuan, Japanese yen.
CURRENCIES = ("USD", "RUB", "IRR", "AED", "EUR", "CNY", "JPY")
TIMEOUT_SECONDS = 8.0


class RatesUnavailable(DomainError):
    status_code = 503
    code = "rates_unavailable"


@dataclass
class Snapshot:
    base: str
    rates: dict[str, float]  # how many units of each currency you get for 1 USD
    updated_at: str  # ISO time the PROVIDER last updated, not when we fetched
    source: str


def _http_get_json(url: str) -> dict:
    """The one place that touches the network (tests replace it)."""
    response = httpx.get(url, timeout=TIMEOUT_SECONDS, follow_redirects=True)
    response.raise_for_status()
    return response.json()


def _from_exchangerate_api() -> Snapshot:
    data = _http_get_json("https://open.er-api.com/v6/latest/USD")
    if data.get("result") != "success":
        raise ValueError("provider reported failure")
    updated = datetime.fromtimestamp(int(data["time_last_update_unix"]), tz=timezone.utc).isoformat()
    return Snapshot("USD", {c: float(data["rates"][c]) for c in CURRENCIES}, updated, "ExchangeRate-API")


def _from_currency_api() -> Snapshot:
    data = _http_get_json("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json")
    table = data["usd"]
    updated = datetime.fromisoformat(data["date"]).replace(tzinfo=timezone.utc).isoformat()
    return Snapshot("USD", {c: float(table[c.lower()]) if c != "USD" else 1.0 for c in CURRENCIES}, updated, "currency-api")


SOURCES = (_from_exchangerate_api, _from_currency_api)  # tried in order


def fetch_fresh() -> Snapshot:
    """Ask the sources in order; the first complete answer wins."""
    for source in SOURCES:
        try:
            snapshot = source()
        except Exception:  # network error, bad JSON, missing currency... any failure means "try the next source"
            continue
        if all(snapshot.rates.get(c, 0) > 0 for c in CURRENCIES):
            return snapshot
    raise RatesUnavailable("Exchange rates are unavailable right now.")


# ---- cache ------------------------------------------------------------------------------------------------

_lock = threading.Lock()
_cached: Snapshot | None = None
_cached_at: float = 0.0


def reset_cache() -> None:
    global _cached, _cached_at
    with _lock:
        _cached, _cached_at = None, 0.0


def get_rates(now: float | None = None) -> tuple[Snapshot, bool]:
    """(snapshot, stale). Fresh within the cache window; after that we refetch. If every source fails we keep
    serving the last good rates, marked stale, rather than showing the user an error."""
    global _cached, _cached_at
    now = time.monotonic() if now is None else now
    with _lock:  # one request refreshes; the others wait and then reuse its result
        if _cached is not None and now - _cached_at < settings.rates_cache_seconds:
            return _cached, False
        try:
            _cached, _cached_at = fetch_fresh(), now
            return _cached, False
        except RatesUnavailable:
            if _cached is not None:
                return _cached, True
            raise
