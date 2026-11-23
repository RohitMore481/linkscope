from fastapi import APIRouter, Request, Response, HTTPException, status
from backend.models.session import (
    SessionActivateRequest,
    SessionActivateResponse,
    SessionStatusResponse,
)
from backend.services.session_store import session_store, SESSION_COOKIE_NAME
from backend.services.encryption import ApiKeyEncryptionService
from backend.services.gemini import GeminiService, InvalidApiKeyError, QuotaExceededError
from backend.services.rate_limiter import rate_limiter
from backend.config import settings

router = APIRouter(prefix="/api/v1/session", tags=["Session Management"])
encryption_service = ApiKeyEncryptionService()

@router.post("/activate", response_model=SessionActivateResponse)
async def activate_session(request: Request, response: Response, payload: SessionActivateRequest):
    """
    Validates a Google Gemini API key live, creates an encrypted in-memory session,
    and sets an HttpOnly session cookie.
    """
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = rate_limiter.check_ip_limit(client_ip, max_requests=30, window_seconds=600)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Please wait {retry_after}s before activating again."
        )

    try:
        # 1. Live probe verification against Gemini API
        await GeminiService.verify_api_key(payload.apiKey)

        # 2. Encrypt key in memory with AES-256-GCM
        serialized_key = encryption_service.encrypt(payload.apiKey)

        # 3. Create anonymous in-memory session
        session_id, expires_at, ttl = session_store.create_session(serialized_key)

        # 4. Issue secure HttpOnly cookie
        is_prod = settings.node_env == "production"
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_id,
            max_age=ttl,
            httponly=True,
            samesite="lax",
            secure=is_prod,
            path="/",
        )

        return SessionActivateResponse(
            status="success",
            message="Session activated successfully.",
            expiresAt=expires_at.isoformat(),
            ttlSeconds=ttl,
        )

    except InvalidApiKeyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except QuotaExceededError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Gemini activation error: {e}")

@router.get("/status", response_model=SessionStatusResponse)
async def get_session_status(request: Request):
    """
    Returns active session status and remaining TTL without exposing the API key.
    """
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        return SessionStatusResponse(active=False)

    stat = session_store.get_status(session_id)
    return SessionStatusResponse(
        active=stat.active,
        expiresAt=stat.expires_at,
        ttlRemaining=stat.ttl_remaining,
    )

@router.post("/logout")
async def logout_session(request: Request, response: Response):
    """
    Wipes the session and encrypted API key from memory and clears the cookie.
    """
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id:
        session_store.delete_session(session_id)
        rate_limiter.release_concurrency_lock(session_id)

    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"status": "success", "message": "Session terminated and memory cleared."}
