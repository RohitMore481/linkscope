import os
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.routers import health, session, analysis
from backend.middleware.security import SecurityHeadersMiddleware
from backend.middleware.csrf import CSRFMiddleware
from backend.services.session_store import session_store
from backend.services.rate_limiter import rate_limiter

# Determine frontend static directory (workspace dist/)
ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start periodic sweep task for expired sessions
    async def periodic_sweep():
        while True:
            try:
                await asyncio.sleep(60)
                purged = session_store.sweep_expired()
                rate_limiter.sweep_expired()
                if purged > 0 and settings.node_env != "test":
                    print(f"[LinkScope] Swept {purged} expired in-memory sessions.")
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[LinkScope] Session sweep error: {e}")

    sweep_task = asyncio.create_task(periodic_sweep())
    print(f"[LinkScope] Starting LinkScope FastAPI backend on port {settings.port} (Model: {settings.ai_model})")

    yield

    # Shutdown: cancel task and wipe volatile in-memory sessions
    sweep_task.cancel()
    session_store.clear()
    rate_limiter.clear()
    print("[LinkScope] Shutting down: in-memory credentials wiped.")

app = FastAPI(
    title="LinkScope — AI-Powered Website Intelligence API",
    description=(
        "Dxora Technologies Practical Test Implementation — extracts public website copy, "
        "defends against SSRF, and generates 5 canonical sections using Google Gemini models.\n\n"
        "**Authentication:**\n"
        "- Browser sessions: use `POST /api/v1/session/activate` with your Gemini API key (cookie `linkscope_session` set automatically).\n"
        "- Direct API / Swagger: provide your Gemini API key via `X-API-Key` or `Authorization: Bearer <key>` header."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# 1. Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# 2. CSRF Origin Validation
app.add_middleware(CSRFMiddleware)

# 3. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Include Routers
app.include_router(health.router)
app.include_router(session.router)
app.include_router(analysis.router)

# 5. Serve React Frontend SPA Assets (if dist/ exists)
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Do not intercept API or documentation routes
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json", "link-analysis")):
            return JSONResponse(status_code=404, content={"error": "Not Found", "message": "Endpoint does not exist."})

        # Check if requesting a direct static file from dist/
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))

        # Fallback to SPA index.html
        index_html = DIST_DIR / "index.html"
        if index_html.is_file():
            return FileResponse(str(index_html))

        return JSONResponse(status_code=404, content={"error": "Not Found", "message": "Page not found."})
