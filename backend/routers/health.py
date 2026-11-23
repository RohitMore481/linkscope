import time
from fastapi import APIRouter
from backend.models.session import HealthResponse
from backend.config import settings

router = APIRouter(tags=["System Health"])

@router.get("/api/health", response_model=HealthResponse)
async def get_health():
    """
    Health check reporting system status, version, active model, and session configuration.
    """
    return HealthResponse(
        status="healthy",
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        version="2.0.0",
        architecture="anonymous_session_byok",
        session_store="in_memory",
        ttl_seconds=settings.session_key_ttl_seconds,
        model=settings.ai_model,
    )
