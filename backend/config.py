import os
import base64
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

# Determine .env location (root of the workspace)
ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT_DIR / ".env"

def validate_encryption_key(raw_key: str | None) -> bytes:
    """Validates that the master encryption key is exactly 32 bytes."""
    if not raw_key or not raw_key.strip():
        raise ValueError(
            "FATAL: GEMINI_ENCRYPTION_KEY environment variable is missing. "
            "LinkScope requires a 32-byte secret for AES-256-GCM encryption of in-memory session credentials. "
            "Generate one using: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" or "
            "python -c \"import secrets; print(secrets.token_hex(32))\""
        )

    trimmed = raw_key.strip()
    # Check if 64-char hex string
    if len(trimmed) == 64:
        try:
            key_bytes = bytes.fromhex(trimmed)
            if len(key_bytes) == 32:
                return key_bytes
        except ValueError:
            pass

    # Check if 44-char base64 string
    try:
        key_bytes = base64.b64decode(trimmed)
        if len(key_bytes) == 32:
            return key_bytes
    except Exception:
        pass

    raise ValueError(
        "FATAL: GEMINI_ENCRYPTION_KEY is invalid. Expected exactly 32 bytes (64 hex characters). "
        "Generate one using: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    port: int = Field(default=4000, alias="PORT")
    node_env: str = Field(default="development", alias="NODE_ENV")
    gemini_encryption_key: str = Field(default="", alias="GEMINI_ENCRYPTION_KEY")
    session_key_ttl_seconds: int = Field(default=86400, alias="SESSION_KEY_TTL_SECONDS")
    ai_provider: str = Field(default="gemini", alias="AI_PROVIDER")
    ai_model: str = Field(default="gemini-3.1-flash-lite", alias="AI_MODEL")
    allowed_origins_raw: str = Field(default="", alias="ALLOWED_ORIGINS")

    @property
    def allowed_origins(self) -> list[str]:
        defaults = [
            "http://localhost:4000",
            "http://localhost:3000",
            "http://127.0.0.1:4000",
            "http://127.0.0.1:3000",
        ]
        if self.allowed_origins_raw.strip():
            extras = [o.strip().lower() for o in self.allowed_origins_raw.split(",") if o.strip()]
            return list(set(defaults + extras))
        return defaults

    def get_encryption_key_bytes(self) -> bytes:
        if self.node_env == "test" and not self.gemini_encryption_key:
            return bytes.fromhex("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
        return validate_encryption_key(self.gemini_encryption_key)

settings = Settings()
