from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from backend.config import settings

class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Only inspect state-modifying methods
        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            origin = request.headers.get("origin")
            if origin:
                clean_origin = origin.rstrip("/").lower()
                allowed = [o.rstrip("/").lower() for o in settings.allowed_origins]
                # Also allow current host
                host = request.headers.get("host", "").lower()
                if clean_origin not in allowed and clean_origin != f"http://{host}" and clean_origin != f"https://{host}":
                    return JSONResponse(
                        status_code=403,
                        content={"error": "CSRF_FORBIDDEN", "detail": f"Untrusted request origin '{origin}'."}
                    )

        return await call_next(request)
