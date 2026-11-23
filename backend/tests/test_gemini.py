import pytest
from backend.services.gemini import (
    GeminiService,
    InvalidApiKeyError,
)
from backend.models.analysis import LinkAnalysisData

def test_key_format_validation():
    # Valid test key
    valid_key = "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst"
    assert GeminiService.validate_key_format(valid_key) == valid_key

    # Trimming whitespace
    assert GeminiService.validate_key_format(f"  {valid_key}  ") == valid_key

    # Reject empty
    with pytest.raises(InvalidApiKeyError, match="non-empty string"):
        GeminiService.validate_key_format("")

    # Reject shell assignment
    with pytest.raises(InvalidApiKeyError, match="assignment syntax"):
        GeminiService.validate_key_format(f"GEMINI_API_KEY={valid_key}")

    # Reject embedded space
    with pytest.raises(InvalidApiKeyError, match="embedded spaces"):
        GeminiService.validate_key_format("AIzaSyTest KeyWithSpace 1234567890")

    # Reject too short
    with pytest.raises(InvalidApiKeyError, match="shorter than expected"):
        GeminiService.validate_key_format("AIzaShortKey")

@pytest.mark.asyncio
async def test_mock_key_verification():
    result = await GeminiService.verify_api_key("AIzaSyMockValidKey1234567890abcdefghijklmnopqrst")
    assert result["valid"] is True
    assert result["provider"] == "gemini"

@pytest.mark.asyncio
async def test_mock_structured_analysis_generation():
    analysis, model, gen_ms, retry_ms = await GeminiService.generate_analysis(
        api_key="AIzaSyMockValidKey1234567890abcdefghijklmnopqrst",
        prompt_text="URL: https://example.com\nPAGE CONTENT: Test page content.",
    )
    assert isinstance(analysis, LinkAnalysisData)
    # Check 5 canonical sections
    assert len(analysis.competitor_vs_your_brand.competitors) >= 3
    assert len(analysis.top_5_target_search_queries) == 5
    assert analysis.seo_improvement.primary_keyword
    assert len(analysis.top_5_services) == 5
    assert len(analysis.target_audience_identification.industries) > 0
    assert gen_ms >= 0
    assert retry_ms == 0
