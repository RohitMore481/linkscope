from pydantic import BaseModel, Field
from typing import Literal

PlatformType = Literal["Google", "Facebook", "Instagram", "LinkedIn", "X"]

# Section 1: Competitor vs Your Brand
class Competitor(BaseModel):
    name: str = Field(description="Name of the direct or indirect competitor")
    why_competitor: str = Field(description="Why this organization competes with the target brand")
    strengths: list[str] = Field(description="Verified capabilities or market advantages")
    weaknesses: list[str] = Field(description="Known gaps, limitations, or vulnerabilities")
    is_inferred: bool = Field(default=False, description="True if competitor is AI-inferred; False if confirmed from page content")
    source: str = Field(default="Researched Fact", description="Information source: 'Page Content' or 'AI Inference'")

class CompetitorSection(BaseModel):
    brand_name: str = Field(description="Identified company, product, or organization name")
    brand_summary: str = Field(default="", description="High-level summary of what the brand does and its positioning")
    competitors: list[Competitor] = Field(min_length=3, description="At least three credible competitors identified")
    your_brand_strengths: list[str] = Field(description="Core strengths and value propositions of the target brand")
    your_brand_weaknesses: list[str] = Field(description="Visible weaknesses or positioning gaps of the target brand")
    opportunities: list[str] = Field(description="Actionable market and competitive opportunities")

# Section 2: Top 5 Target Search Queries
class SearchQuery(BaseModel):
    query: str = Field(description="High-intent search query string")
    platform: str = Field(description="Target platform: Google, Facebook, Instagram, LinkedIn, or X")
    intent: str = Field(description="Search intent: Commercial, Informational, Transactional, or Navigational")
    business_relevance: str = Field(description="Strategic business justification for targeting this search query")
    target_audience: str = Field(description="Specific buyer persona or role searching for this query")

# Section 3: SEO Improvement
class SEOSection(BaseModel):
    primary_keyword: str = Field(description="Top-priority primary target keyword")
    secondary_keywords: list[str] = Field(description="Contextual secondary search keywords")
    long_tail_keywords: list[str] = Field(default_factory=list, description="Specific, low-competition long-tail search phrases")
    seo_title: str = Field(description="Optimized title tag under 60 characters")
    meta_description: str = Field(description="Compelling meta description between 140-160 characters")
    content_ideas: list[str] = Field(description="Strategic content roadmap and topical authority topics")

# Section 4: Top 5 Services
class ServiceItem(BaseModel):
    name: str = Field(description="Offering title or product tier")
    description: str = Field(description="Clear explanation of what the offering provides")
    target_industry: str = Field(default="Cross-industry", description="Industry vertical most suited for this service")
    target_customer: str = Field(default="Target Decision-makers", description="Buyer role or company size")
    main_benefit: str = Field(default="Value delivery", description="Primary outcome or ROI delivered to the client")

# Section 5: Target Audience Identification
class AudienceSection(BaseModel):
    primary_audience: str = Field(description="Ideal customer profile (ICP) and core decision-makers")
    secondary_audience: str = Field(description="Secondary influencers, operators, or end-users")
    industry_segments: list[str] = Field(default_factory=list, description="Industry verticals that benefit most")
    industries: list[str] = Field(description="Industry verticals (backward compatibility)")
    business_types: list[str] = Field(default_factory=list, description="Business models: B2B, B2C, Enterprise, SMB, Startups")
    customer_profiles: list[str] = Field(default_factory=list, description="Specific organizational personas")
    geographical_focus: str = Field(default="Global", description="Regional or international focus indicated by site")
    customer_needs: list[str] = Field(description="Core operational, technical, or economic pain points solved")
    interests: list[str] = Field(default_factory=list, description="Relevant professional or consumer interests")
    recommended_segments: list[str] = Field(description="High-priority marketing expansion segments")

# Combined 5-Section Intelligence Contract
class LinkAnalysisData(BaseModel):
    competitor_vs_your_brand: CompetitorSection
    top_5_target_search_queries: list[SearchQuery] = Field(min_length=5, max_length=5)
    seo_improvement: SEOSection
    top_5_services: list[ServiceItem] = Field(min_length=5, max_length=5)
    target_audience_identification: AudienceSection

class AnalysisTimings(BaseModel):
    fetchMs: int = 0
    parseMs: int = 0
    reduceMs: int = 0
    generationMs: int = 0
    retryMs: int = 0
    totalMs: int = 0

class AnalysisMeta(BaseModel):
    model: str
    provider: str
    input_chars: int
    timings: AnalysisTimings = Field(default_factory=AnalysisTimings)
    inferred_data_disclaimer: str = (
        "Competitor profiles, weaknesses, opportunities, and search intents are AI-inferred "
        "from page content without live traffic or search volume data."
    )

class LinkAnalysisResponse(BaseModel):
    status: str = "success"
    url: str
    analysis: LinkAnalysisData
    meta: AnalysisMeta

class LinkAnalysisRequest(BaseModel):
    url: str = Field(description="Public website URL to scrape and analyze")
    model: str | None = Field(default=None, description="Optional Gemini model override")
