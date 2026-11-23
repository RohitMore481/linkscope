from typing import Annotated
from fastapi import Request, Header, Cookie, HTTPException, status
from backend.services.session_store import session_store, SESSION_COOKIE_NAME
from backend.services.encryption import ApiKeyEncryptionService
from backend.services.gemini import GeminiService

encryption_service = ApiKeyEncryptionService()

class AuthContext:
    def __init__(self, api_key: str, session_id: str):
        self.api_key = api_key
        self.session_id = session_id

async def get_auth_context(
    request: Request,
    linkscope_session: Annotated[str | None, Cookie()] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthContext:
    """
    Authenticates requests via either:
    1. Browser HttpOnly cookie ('linkscope_session')
    2. Header 'X-API-Key' (ideal for cURL / Swagger testing)
    3. Header 'Authorization: Bearer <key>'
    """
    # 1. Direct API Key Header check (for Swagger UI / automated test runners)
    raw_header_key: str | None = None
    if x_api_key and x_api_key.strip():
        raw_header_key = x_api_key.strip()
    elif authorization and authorization.strip():
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            raw_header_key = parts[1].strip()

    if raw_header_key:
        try:
            validated_key = GeminiService.validate_key_format(raw_header_key)
            # Ephemeral session identifier based on client IP for rate limiting
            client_ip = request.client.host if request.client else "unknown"
            return AuthContext(api_key=validated_key, session_id=f"header:{client_ip}")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed API Key header: {e}"
            )

    # 2. Session Cookie check (for React Frontend web sessions)
    session_id = linkscope_session or request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Active session required. Please activate LinkScope with your Gemini API key."
        )

    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your LinkScope session has expired or is invalid. Please re-enter your Gemini API key."
        )

    try:
        decrypted_key = encryption_service.decrypt(session.encrypted_key)
        return AuthContext(api_key=decrypted_key, session_id=session_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decrypt session credentials: {e}"
        )
