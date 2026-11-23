import re
import time
import random
import json
from google import genai
from google.genai import types
from google.genai.errors import APIError
from backend.config import settings
from backend.models.analysis import LinkAnalysisData

SYSTEM_INSTRUCTION = (
    "You are a senior digital strategy, SEO, and market-research analyst. "
    "Base your analysis strictly on the provided website content. "
    "Do NOT invent numeric metrics such as search volume, traffic, rankings, or revenue; "
    "whenever you infer positioning, competitors, or market gaps not explicitly stated on the page, "
    "set 'is_inferred': true and 'source': 'AI Inference', otherwise 'source': 'Page Content'. "
    "Identify at least 3 credible competitors where reliable information is available. "
    "Provide EXACTLY 5 items in 'top_5_target_search_queries' mapped across relevant platforms "
    "(Google, Facebook, Instagram, LinkedIn, X) with intent, business relevance, and target audience. "
    "In 'seo_improvement', include primary, secondary, and long-tail keywords, title, meta description, and content ideas. "
    "In 'top_5_services', provide EXACTLY 5 primary services with name, description, target industry, target customer, and main benefit. "
    "In 'target_audience_identification', provide primary and secondary audiences, industry segments, business types, customer profiles, geographical focus, needs, interests, and recommended segments. "
    "Avoid fabricated information and keep each description concise and insightful."
)

class AIError(Exception):
    def __init__(self, message: str, code: str = "AI_ERROR", status_code: int = 502, retryable: bool = False):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.retryable = retryable

class InvalidApiKeyError(AIError):
    def __init__(self, message: str = "Invalid Google Gemini API key."):
        super().__init__(message, code="INVALID_API_KEY", status_code=400, retryable=False)

class QuotaExceededError(AIError):
    def __init__(self, message: str = "Google Gemini quota exceeded. Please check your billing or rate limits."):
        super().__init__(message, code="QUOTA_EXCEEDED", status_code=429, retryable=False)

class GeminiService:
    @staticmethod
    def validate_key_format(api_key: str | None) -> str:
        """Validates that the provided API key has a legitimate structure without whitespace or assignments."""
        if not api_key or not isinstance(api_key, str):
            raise InvalidApiKeyError("API key must be provided as a non-empty string.")

        trimmed = api_key.strip()
        if not trimmed:
            raise InvalidApiKeyError("API key cannot be empty or whitespace.")

        # Reject pasted shell assignments e.g. "GEMINI_API_KEY=AIzaSy..."
        if "=" in trimmed or "export " in trimmed.lower():
            raise InvalidApiKeyError("Malformed API key: contains assignment syntax or shell export statement.")

        # Reject embedded whitespace or control characters
        if re.search(r"\s", trimmed):
            raise InvalidApiKeyError("Malformed API key: contains embedded spaces or control characters.")

        if len(trimmed) < 20:
            raise InvalidApiKeyError("Malformed API key: key length is shorter than expected.")

        return trimmed

    @staticmethod
    async def verify_api_key(api_key: str) -> dict:
        """
        Validates the key live against Google Gemini.
        Performs authentication, model availability, and structured output checks.
        """
        validated_key = GeminiService.validate_key_format(api_key)

        # Mock keys for offline testing
        if "mock" in validated_key.lower() or "testvalidkey" in validated_key.lower():
            return {
                "valid": True,
                "provider": "gemini",
                "model": settings.ai_model,
                "testedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }

        client = genai.Client(api_key=validated_key)
        try:
            # Lightweight probe with structured response contract
            probe_config = types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
                max_output_tokens=50,
            )
            response = client.models.generate_content(
                model=settings.ai_model,
                contents='Respond with {"ping": "pong"}',
                config=probe_config,
            )
            if not response.text:
                raise AIError("Empty response received from Gemini probe.")

            return {
                "valid": True,
                "provider": "gemini",
                "model": settings.ai_model,
                "testedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        except APIError as e:
            msg = str(e).lower()
            if e.code == 400 or "api_key" in msg or "invalid" in msg or e.code == 403:
                raise InvalidApiKeyError(f"Your Google Gemini API key was rejected: {e.message or str(e)}")
            if e.code == 429 or "quota" in msg or "resource_exhausted" in msg:
                raise QuotaExceededError(f"Google Gemini quota exceeded: {e.message or str(e)}")
            raise AIError(f"Gemini verification error ({e.code}): {e.message or str(e)}", status_code=502)
        except Exception as e:
            msg = str(e).lower()
            if "quota" in msg or "429" in msg:
                raise QuotaExceededError(str(e))
            if "key" in msg and ("invalid" in msg or "not found" in msg):
                raise InvalidApiKeyError(str(e))
            raise AIError(f"Failed to verify API key with Google Gemini: {e}")

    @staticmethod
    async def generate_analysis(
        api_key: str,
        prompt_text: str,
        model_override: str | None = None
    ) -> tuple[LinkAnalysisData, str, int, int]:
        """
        Executes structured analysis generation using Gemini with bounded 503 retry.
        Returns (analysis_data, model_used, generation_ms, retry_ms).
        """
        validated_key = GeminiService.validate_key_format(api_key)
        model_name = model_override or settings.ai_model

        # Mock fallback for test keys
        if "mock" in validated_key.lower() or "testvalidkey" in validated_key.lower():
            mock_data = LinkAnalysisData(
                competitor_vs_your_brand={
                    "brand_name": "Mock Test Brand",
                    "brand_summary": "A mock company providing test automation solutions.",
                    "competitors": [
                        {"name": "Competitor Alpha", "why_competitor": "Direct competitor in testing space", "strengths": ["Market reach"], "weaknesses": ["Legacy stack"], "is_inferred": False, "source": "Page Content"},
                        {"name": "Competitor Beta", "why_competitor": "Alternative enterprise provider", "strengths": ["Enterprise sales"], "weaknesses": ["High cost"], "is_inferred": True, "source": "AI Inference"},
                        {"name": "Competitor Gamma", "why_competitor": "Open source alternative", "strengths": ["Community size"], "weaknesses": ["No support"], "is_inferred": True, "source": "AI Inference"},
                    ],
                    "your_brand_strengths": ["Modern UX", "Fast performance"],
                    "your_brand_weaknesses": ["Smaller market awareness"],
                    "opportunities": ["Expand mid-market sales", "SEO content authority"],
                },
                top_5_target_search_queries=[
                    {"query": "best website intelligence tool", "platform": "Google", "intent": "Commercial", "business_relevance": "Primary category search capture", "target_audience": "Digital Strategists"},
                    {"query": "competitor analysis platform for marketers", "platform": "LinkedIn", "intent": "Informational", "business_relevance": "B2B buyer acquisition", "target_audience": "Marketing Directors"},
                    {"query": "link analysis software demo", "platform": "X", "intent": "Transactional", "business_relevance": "Direct trial signups", "target_audience": "Growth Engineers"},
                    {"query": "seo website audit tool", "platform": "Facebook", "intent": "Commercial", "business_relevance": "SMB agency traffic", "target_audience": "Agency Owners"},
                    {"query": "instant website competitor teardown", "platform": "Instagram", "intent": "Informational", "business_relevance": "Brand awareness and reach", "target_audience": "Content Creators"},
                ],
                seo_improvement={
                    "primary_keyword": "website intelligence",
                    "secondary_keywords": ["competitor analysis", "link analysis", "seo recommendations"],
                    "long_tail_keywords": ["automated competitor intelligence software", "real-time link analysis platform"],
                    "seo_title": "LinkScope — AI-Powered Website Intelligence Platform",
                    "meta_description": "Transform any website link into structured competitor, SEO, and audience intelligence reports.",
                    "content_ideas": ["How to Analyze Competitor Websites in 5 Minutes", "The Modern Guide to Search Query Intent"],
                },
                top_5_services=[
                    {"name": "Competitor Intelligence", "description": "Automated teardowns of brand competitors", "target_industry": "SaaS / Tech", "target_customer": "Growth Teams", "main_benefit": "Uncover market gaps"},
                    {"name": "Search Query Mapping", "description": "Multi-platform commercial query extraction", "target_industry": "Digital Marketing", "target_customer": "SEO Managers", "main_benefit": "Capture high intent"},
                    {"name": "SEO Audit Roadmap", "description": "Actionable title, meta, and keyword suggestions", "target_industry": "Agencies", "target_customer": "Content Teams", "main_benefit": "Improve SERP rank"},
                    {"name": "Audience Profiling", "description": "Buyer persona and pain-point identification", "target_industry": "E-commerce", "target_customer": "Product Marketing", "main_benefit": "Sharpen positioning"},
                    {"name": "Executive PDF Reporting", "description": "Client-ready downloadable intelligence reports", "target_industry": "Consultancies", "target_customer": "Consultants", "main_benefit": "Deliver client value"},
                ],
                target_audience_identification={
                    "primary_audience": "Product Marketers and SEO Leads",
                    "secondary_audience": "Digital Agency Consultants and Founders",
                    "industry_segments": ["Technology", "Marketing", "E-commerce"],
                    "industries": ["Technology", "Marketing", "E-commerce"],
                    "business_types": ["B2B SaaS", "Digital Agencies", "Mid-market"],
                    "customer_profiles": ["VP of Marketing", "Growth Lead", "SEO Specialist"],
                    "geographical_focus": "North America and Global English Markets",
                    "customer_needs": ["Automate manual competitive research", "Fast structured website audits"],
                    "interests": ["SEO optimization", "Competitive strategy", "Digital marketing tools"],
                    "recommended_segments": ["Mid-Market B2B SaaS", "Boutique SEO Agencies"],
                },
            )
            return mock_data, model_name, 120, 0

        client = genai.Client(api_key=validated_key)
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=LinkAnalysisData,
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.2,
        )

        max_attempts = 2
        total_retry_ms = 0

        for attempt in range(1, max_attempts + 1):
            start_time = time.time()
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt_text,
                    config=config,
                )
                generation_ms = int((time.time() - start_time) * 1000)

                if not response.text:
                    raise AIError("Gemini returned an empty text response.", "EMPTY_RESPONSE", 502)

                raw_json = json.loads(response.text)
                analysis = LinkAnalysisData.model_validate(raw_json)
                return analysis, model_name, generation_ms, total_retry_ms

            except APIError as e:
                duration_ms = int((time.time() - start_time) * 1000)
                # Bounded retry only on 503 / UNAVAILABLE
                if (e.code == 503 or "unavailable" in str(e).lower()) and attempt < max_attempts:
                    retry_delay = 1.0 + random.uniform(0.1, 0.5)
                    time.sleep(retry_delay)
                    total_retry_ms += int(retry_delay * 1000)
                    continue

                if e.code == 429:
                    raise QuotaExceededError(f"Quota exceeded: {e.message}")
                if e.code in (400, 401, 403):
                    raise InvalidApiKeyError(f"API key error: {e.message}")
                raise AIError(f"Upstream Gemini API error ({e.code}): {e.message}", "PROVIDER_ERROR", 502)

            except json.JSONDecodeError as e:
                raise AIError(f"Failed to parse Gemini structured JSON: {e}", "INVALID_RESPONSE_JSON", 502)
            except Exception as e:
                raise AIError(f"Gemini analysis generation error: {e}", "GENERATION_ERROR", 502)

        raise AIError("Maximum generation retry attempts exhausted.", "RETRY_EXHAUSTED", 503)
