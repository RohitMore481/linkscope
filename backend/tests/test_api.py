import pytest
from httpx import AsyncClient

MOCK_KEY = "AIzaSyMockValidKey1234567890abcdefghijklmnopqrst"

@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    response = await async_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "2.0.0"
    assert "model" in data
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert "x-request-id" in response.headers

@pytest.mark.asyncio
async def test_documentation_endpoints(async_client: AsyncClient):
    # OpenAPI Swagger UI
    docs_res = await async_client.get("/docs")
    assert docs_res.status_code == 200
    assert "swagger-ui" in docs_res.text.lower() or "html" in docs_res.headers.get("content-type", "")

    # ReDoc
    redoc_res = await async_client.get("/redoc")
    assert redoc_res.status_code == 200
    assert "redoc" in redoc_res.text.lower() or "html" in redoc_res.headers.get("content-type", "")

    # Root index / SPA
    root_res = await async_client.get("/")
    assert root_res.status_code == 200

@pytest.mark.asyncio
async def test_unauthenticated_analysis_rejection(async_client: AsyncClient):
    # Primary endpoint
    res1 = await async_client.post("/link-analysis", json={"url": "https://stripe.com"})
    assert res1.status_code == 401
    assert "Active session required" in res1.json()["detail"]

    # Alias endpoint
    res2 = await async_client.post("/api/analyze", json={"url": "https://stripe.com"})
    assert res2.status_code == 401

@pytest.mark.asyncio
async def test_session_activation_and_cookie_flow(async_client: AsyncClient):
    # Activate with valid test key
    act_res = await async_client.post("/api/v1/session/activate", json={"apiKey": MOCK_KEY})
    assert act_res.status_code == 200
    act_data = act_res.json()
    assert act_data["status"] == "success"
    assert "linkscope_session" in act_res.cookies

    session_cookie = act_res.cookies["linkscope_session"]
    async_client.cookies.set("linkscope_session", session_cookie)

    # Check status with session cookie
    status_res = await async_client.get("/api/v1/session/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["active"] is True
    assert status_data["ttlRemaining"] > 0

    # Execute analysis using session cookie
    analysis_res = await async_client.post(
        "/link-analysis",
        json={"url": "https://mock.test"},
    )
    assert analysis_res.status_code == 200
    res_json = analysis_res.json()
    assert res_json["status"] == "success"
    assert "competitor_vs_your_brand" in res_json["analysis"]
    assert len(res_json["analysis"]["top_5_target_search_queries"]) == 5
    assert len(res_json["analysis"]["top_5_services"]) == 5

    # Logout
    logout_res = await async_client.post("/api/v1/session/logout")
    assert logout_res.status_code == 200

    # Subsequent request with old cookie fails
    async_client.cookies.set("linkscope_session", session_cookie)
    post_logout_res = await async_client.post(
        "/link-analysis",
        json={"url": "https://mock.test"},
    )
    assert post_logout_res.status_code == 401

@pytest.mark.asyncio
async def test_direct_api_key_header_flow(async_client: AsyncClient):
    # Direct test via X-API-Key header (No cookie needed)
    headers = {"X-API-Key": MOCK_KEY}
    res = await async_client.post(
        "/link-analysis",
        json={"url": "https://mock.test"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["url"] == "https://mock.test"
    assert data["analysis"]["competitor_vs_your_brand"]["brand_name"] == "Mock Test Brand"

@pytest.mark.asyncio
async def test_bearer_token_header_flow(async_client: AsyncClient):
    # Direct test via Authorization: Bearer <key> header
    headers = {"Authorization": f"Bearer {MOCK_KEY}"}
    res = await async_client.post(
        "/link-analysis",
        json={"url": "https://mock.test"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"

@pytest.mark.asyncio
async def test_invalid_url_rejection(async_client: AsyncClient):
    headers = {"X-API-Key": MOCK_KEY}
    res = await async_client.post(
        "/link-analysis",
        json={"url": "ftp://invalid-scheme.com"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "Only http and https" in res.json()["detail"]

@pytest.mark.asyncio
async def test_malformed_key_rejection(async_client: AsyncClient):
    res = await async_client.post(
        "/api/v1/session/activate",
        json={"apiKey": "GEMINI_API_KEY=AIzaSyInvalidKey"},
    )
    assert res.status_code == 400
    assert "assignment syntax" in res.json()["detail"]

@pytest.mark.asyncio
async def test_all_five_sections_deep_validation(async_client: AsyncClient):
    headers = {"X-API-Key": MOCK_KEY}
    res = await async_client.post(
        "/link-analysis",
        json={"url": "https://mock.test"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    analysis = data["analysis"]

    # Section 1: Competitor vs Your Brand
    s1 = analysis["competitor_vs_your_brand"]
    assert s1["brand_name"] != ""
    assert "brand_summary" in s1
    assert len(s1["competitors"]) >= 3
    for comp in s1["competitors"]:
        assert "name" in comp
        assert "why_competitor" in comp
        assert "is_inferred" in comp
        assert isinstance(comp["is_inferred"], bool)
        assert "source" in comp
        assert len(comp["strengths"]) > 0
        assert len(comp["weaknesses"]) > 0
    assert len(s1["your_brand_strengths"]) > 0
    assert len(s1["your_brand_weaknesses"]) > 0
    assert len(s1["opportunities"]) > 0

    # Section 2: Top 5 Target Search Queries
    s2 = analysis["top_5_target_search_queries"]
    assert len(s2) == 5
    for q in s2:
        assert q["platform"] in ("Google", "Facebook", "Instagram", "LinkedIn", "X")
        assert q["intent"] in ("Commercial", "Informational", "Navigational", "Transactional")
        assert "business_relevance" in q and q["business_relevance"] != ""
        assert "target_audience" in q and q["target_audience"] != ""
        assert "query" in q and q["query"] != ""

    # Section 3: SEO Improvement
    s3 = analysis["seo_improvement"]
    assert s3["primary_keyword"] != ""
    assert len(s3["secondary_keywords"]) > 0
    assert len(s3["long_tail_keywords"]) > 0
    assert len(s3["seo_title"]) <= 65
    assert len(s3["meta_description"]) <= 165
    assert len(s3["content_ideas"]) > 0

    # Section 4: Top 5 Services
    s4 = analysis["top_5_services"]
    assert len(s4) == 5
    for srv in s4:
        assert srv["name"] != ""
        assert srv["description"] != ""
        assert srv["target_industry"] != ""
        assert srv["target_customer"] != ""
        assert srv["main_benefit"] != ""

    # Section 5: Target Audience Identification
    s5 = analysis["target_audience_identification"]
    assert s5["primary_audience"] != ""
    assert s5["secondary_audience"] != ""
    assert len(s5["industry_segments"]) > 0
    assert len(s5["business_types"]) > 0
    assert len(s5["customer_profiles"]) > 0
    assert s5["geographical_focus"] != ""
    assert len(s5["customer_needs"]) > 0
    assert len(s5["interests"]) > 0
    assert len(s5["recommended_segments"]) > 0
