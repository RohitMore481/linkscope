from pydantic import BaseModel, Field

class SessionActivateRequest(BaseModel):
    apiKey: str = Field(description="Google Gemini API key provided by the user (BYOK)")

class SessionActivateResponse(BaseModel):
    status: str = "success"
    message: str = "Session activated successfully."
    expiresAt: str
    ttlSeconds: int

class SessionStatusResponse(BaseModel):
    active: bool
    expiresAt: str | None = None
    ttlRemaining: int | None = None

class HealthResponse(BaseModel):
    status: str = "healthy"
    timestamp: str
    version: str = "2.0.0"
    architecture: str = "anonymous_session_byok"
    session_store: str = "in_memory"
    ttl_seconds: int
    model: str
