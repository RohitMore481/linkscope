import uuid
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from backend.config import settings

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        start_time = time.time()

        response: Response = await call_next(request)

        # Set Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Request-Id"] = request_id

        if settings.node_env == "production" or request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        duration_ms = (time.time() - start_time) * 1000
        # Privacy-conscious logging: NEVER log request bodies, auth cookies, or keys
        if settings.node_env != "test":
            print(f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] [{request_id}] {request.method} {request.url.path} {response.status_code} {duration_ms:.2f}ms")

        return response
