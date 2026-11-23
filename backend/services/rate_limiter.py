import time
from typing import NamedTuple

class RateLimitRecord(NamedTuple):
    count: int
    reset_at: float

class RateLimiterService:
    def __init__(self):
        self._ip_limits: dict[str, RateLimitRecord] = {}
        self._user_limits: dict[str, RateLimitRecord] = {}
        self._active_analyses: set[str] = set()

    def check_ip_limit(self, ip: str, max_requests: int = 60, window_seconds: float = 600.0) -> tuple[bool, int]:
        """Sliding-window IP rate limiter."""
        now = time.time()
        record = self._ip_limits.get(ip)

        if not record or now > record.reset_at:
            self._ip_limits[ip] = RateLimitRecord(count=1, reset_at=now + window_seconds)
            return True, 0

        if record.count >= max_requests:
            retry_after = max(1, int(record.reset_at - now))
            return False, retry_after

        self._ip_limits[ip] = RateLimitRecord(count=record.count + 1, reset_at=record.reset_at)
        return True, 0

    def check_user_limit(self, user_id: str, max_requests: int = 20, window_seconds: float = 900.0) -> tuple[bool, int]:
        """Sliding-window User/Session rate limiter."""
        now = time.time()
        record = self._user_limits.get(user_id)

        if not record or now > record.reset_at:
            self._user_limits[user_id] = RateLimitRecord(count=1, reset_at=now + window_seconds)
            return True, 0

        if record.count >= max_requests:
            retry_after = max(1, int(record.reset_at - now))
            return False, retry_after

        self._user_limits[user_id] = RateLimitRecord(count=record.count + 1, reset_at=record.reset_at)
        return True, 0

    def acquire_concurrency_lock(self, session_id: str) -> bool:
        """Acquires a single in-flight analysis lock for a session."""
        if session_id in self._active_analyses:
            return False
        self._active_analyses.add(session_id)
        return True

    def release_concurrency_lock(self, session_id: str) -> None:
        """Releases the in-flight analysis lock for a session."""
        self._active_analyses.discard(session_id)

    def sweep_expired(self) -> None:
        """Removes expired window entries."""
        now = time.time()
        self._ip_limits = {k: v for k, v in self._ip_limits.items() if now <= v.reset_at}
        self._user_limits = {k: v for k, v in self._user_limits.items() if now <= v.reset_at}

    def clear(self) -> None:
        """Resets all limits and locks."""
        self._ip_limits.clear()
        self._user_limits.clear()
        self._active_analyses.clear()

rate_limiter = RateLimiterService()
