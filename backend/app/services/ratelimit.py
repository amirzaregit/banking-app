"""A tiny in-memory sliding-window rate limiter.

State lives in this process only. That is fine for one server process; with several
workers each would count separately, so production would use Redis instead.

Two styles of use:
  * check()          record a hit AND refuse if over the limit (e.g. "20 lookups/minute")
  * peek()/record()  look first, record only on a bad outcome (e.g. failed logins)
"""

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    # -- internals (caller holds the lock) --

    def _live_hits(self, k: tuple[str, str], window: float, now: float) -> deque[float] | None:
        hits = self._hits.get(k)
        if hits is None:
            return None
        while hits and hits[0] <= now - window:  # forget hits outside the window
            hits.popleft()
        if not hits:
            del self._hits[k]  # don't let idle keys pile up in memory
            return None
        return hits

    def _wait(self, k: tuple[str, str], limit: int, window: float, now: float) -> float | None:
        hits = self._live_hits(k, window, now)
        if hits is not None and len(hits) >= limit:
            return hits[0] + window - now
        return None

    # -- public --

    def check(self, bucket: str, key: str, limit: int, window: float, now: float | None = None) -> float | None:
        """Record a hit. Returns None if allowed, else the seconds until a slot frees up."""
        now = time.monotonic() if now is None else now
        with self._lock:
            wait = self._wait((bucket, key), limit, window, now)
            if wait is not None:
                return wait
            self._hits[(bucket, key)].append(now)
            return None

    def peek(self, bucket: str, key: str, limit: int, window: float, now: float | None = None) -> float | None:
        """Like check() but records nothing. None = allowed, else seconds to wait."""
        now = time.monotonic() if now is None else now
        with self._lock:
            return self._wait((bucket, key), limit, window, now)

    def record(self, bucket: str, key: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            self._hits[(bucket, key)].append(now)

    def clear(self, bucket: str, key: str) -> None:
        with self._lock:
            self._hits.pop((bucket, key), None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()
