import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import NamedTuple
from backend.config import settings

SESSION_COOKIE_NAME = "linkscope_session"

class SessionData(NamedTuple):
    encrypted_key: str
    created_at: datetime
    expires_at: datetime

class SessionStatus(NamedTuple):
    active: bool
    expires_at: str | None = None
    ttl_remaining: int | None = None

class InMemorySessionStore:
    def __init__(self, default_ttl_seconds: int | None = None):
        self.default_ttl_seconds = default_ttl_seconds or settings.session_key_ttl_seconds
        self._sessions: dict[str, SessionData] = {}

    def create_session(self, encrypted_key: str, ttl_seconds: int | None = None) -> tuple[str, datetime, int]:
        """Creates a session with a cryptographically secure 256-bit session token."""
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl_seconds
        session_id = secrets.token_hex(32)  # 256 bits of entropy
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=ttl)

        self._sessions[session_id] = SessionData(
            encrypted_key=encrypted_key,
            created_at=now,
            expires_at=expires_at
        )
        return session_id, expires_at, ttl

    def get_session(self, session_id: str | None) -> SessionData | None:
        """Retrieves active session data or purges and returns None if expired."""
        if not session_id or not isinstance(session_id, str):
            return None

        session = self._sessions.get(session_id)
        if not session:
            return None

        now = datetime.now(timezone.utc)
        if now > session.expires_at:
            self._sessions.pop(session_id, None)
            return None

        return session

    def delete_session(self, session_id: str | None) -> bool:
        """Deletes session and encrypted key from memory."""
        if not session_id:
            return False
        return self._sessions.pop(session_id, None) is not None

    def get_status(self, session_id: str | None) -> SessionStatus:
        """Returns session status without ever exposing the key."""
        session = self.get_session(session_id)
        if not session:
            return SessionStatus(active=False)

        now = datetime.now(timezone.utc)
        ttl_remaining = max(0, int((session.expires_at - now).total_seconds()))
        return SessionStatus(
            active=True,
            expires_at=session.expires_at.isoformat(),
            ttl_remaining=ttl_remaining
        )

    def sweep_expired(self) -> int:
        """Purges expired sessions from volatile memory."""
        now = datetime.now(timezone.utc)
        expired = [s_id for s_id, s in self._sessions.items() if now > s.expires_at]
        for s_id in expired:
            self._sessions.pop(s_id, None)
        return len(expired)

    def clear(self) -> None:
        """Wipes all sessions from memory immediately."""
        self._sessions.clear()

    @property
    def count(self) -> int:
        return len(self._sessions)

session_store = InMemorySessionStore()
