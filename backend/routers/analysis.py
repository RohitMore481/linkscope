import time
from fastapi import APIRouter, Depends, HTTPException, status
from backend.models.analysis import (
    LinkAnalysisRequest,
    LinkAnalysisResponse,
    AnalysisMeta,
    AnalysisTimings,
)
from backend.dependencies import get_auth_context, AuthContext
from backend.services.scraper import ScraperService, ScrapeError, URLValidationError
from backend.services.gemini import GeminiService, AIError, InvalidApiKeyError, QuotaExceededError
from backend.services.rate_limiter import rate_limiter

router = APIRouter(tags=["Website Intelligence Analysis"])

async def execute_analysis(
    payload: LinkAnalysisRequest,
    auth: AuthContext,
) -> LinkAnalysisResponse:
    target_url = payload.url.strip() if payload.url else ""
    if not target_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid website URL to analyze."
        )

    # 1. User rate limit check
    allowed, retry_after = rate_limiter.check_user_limit(auth.session_id, max_requests=20, window_seconds=900)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Analysis rate limit exceeded. Please wait {retry_after}s before your next request."
        )

    # 2. Acquire session concurrency lock
    if not rate_limiter.acquire_concurrency_lock(auth.session_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="An analysis is already in progress for your session. Please wait for it to complete."
        )

    request_start_time = time.time()
    try:
        # 3. Hardened SSRF-safe website scrape & reduction
        scraped = await ScraperService.scrape_website(target_url)

        # 4. Generate structured 5-section analysis with Gemini
        analysis_data, model_used, gen_ms, retry_ms = await GeminiService.generate_analysis(
            api_key=auth.api_key,
            prompt_text=scraped.prompt_text,
            model_override=payload.model,
        )

        total_ms = int((time.time() - request_start_time) * 1000)

        timings = AnalysisTimings(
            fetchMs=scraped.timings.fetch_duration_ms,
            parseMs=scraped.timings.parse_duration_ms,
            reduceMs=scraped.timings.reduce_duration_ms,
            generationMs=gen_ms,
            retryMs=retry_ms,
            totalMs=total_ms,
        )

        meta = AnalysisMeta(
            model=model_used,
            provider="gemini",
            input_chars=len(scraped.prompt_text),
            timings=timings,
        )

        return LinkAnalysisResponse(
            status="success",
            url=scraped.url,
            analysis=analysis_data,
            meta=meta,
        )

    except URLValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except ScrapeError as e:
        raise HTTPException(status_code=e.status_code or status.HTTP_400_BAD_REQUEST, detail=e.message)
    except InvalidApiKeyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
    except QuotaExceededError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=e.message)
    except AIError as e:
        raise HTTPException(status_code=e.status_code or status.HTTP_502_BAD_GATEWAY, detail=e.message)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during analysis: {e}"
        )
    finally:
        rate_limiter.release_concurrency_lock(auth.session_id)

# Primary Endpoint specified by Dxora Assignment
@router.post(
    "/link-analysis",
    response_model=LinkAnalysisResponse,
    summary="Analyze public website link (Assignment Specification)",
    description="Extracts public website copy, checks SSRF, and generates 5 canonical sections using Google Gemini."
)
async def analyze_link(
    payload: LinkAnalysisRequest,
    auth: AuthContext = Depends(get_auth_context)
):
    return await execute_analysis(payload, auth)

# Frontend Compatibility Aliases
@router.post("/api/analyze", response_model=LinkAnalysisResponse, include_in_schema=False)
async def analyze_alias_api(
    payload: LinkAnalysisRequest,
    auth: AuthContext = Depends(get_auth_context)
):
    return await execute_analysis(payload, auth)

@router.post("/api/link-analysis", response_model=LinkAnalysisResponse, include_in_schema=False)
async def analyze_alias_api_link(
    payload: LinkAnalysisRequest,
    auth: AuthContext = Depends(get_auth_context)
):
    return await execute_analysis(payload, auth)

@router.post("/api/v1/analyze", response_model=LinkAnalysisResponse, include_in_schema=False)
async def analyze_alias_api_v1(
    payload: LinkAnalysisRequest,
    auth: AuthContext = Depends(get_auth_context)
):
    return await execute_analysis(payload, auth)
