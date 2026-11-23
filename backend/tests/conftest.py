import os
import pytest
from httpx import AsyncClient, ASGITransport

# Force test mode
os.environ["NODE_ENV"] = "test"
os.environ["GEMINI_ENCRYPTION_KEY"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

from backend.main import app
from backend.services.session_store import session_store
from backend.services.rate_limiter import rate_limiter

@pytest.fixture(autouse=True)
def reset_stores():
    session_store.clear()
    rate_limiter.clear()
    yield
    session_store.clear()
    rate_limiter.clear()

@pytest.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
