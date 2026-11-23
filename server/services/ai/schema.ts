import { Type } from "@google/genai";
import type { LinkAnalysisData } from "../../../src/types/analysis";
import { InvalidModelResponseError } from "./aiErrors";

export const SYSTEM_INSTRUCTION =
  "You are a senior digital strategy, SEO, and market-research analyst. " +
  "Base your analysis strictly on the provided website content. " +
  "Do NOT invent numeric metrics such as search volume, traffic, rankings, or revenue; " +
  "whenever you infer positioning, competitors, or market gaps not explicitly stated on the page, " +
  "append ' (inferred)' to those items. " +
  "Provide EXACTLY 5 items in 'top_5_target_search_queries' across relevant platforms " +
  "(Google Search, Facebook, Instagram, LinkedIn, X) and EXACTLY 5 items in 'top_5_services'. " +
  "Keep every string concise (25 words or fewer).";

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    competitor_vs_your_brand: {
      type: Type.OBJECT,
      properties: {
        brand_name: { type: Type.STRING },
        competitors: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              why_competitor: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["name", "why_competitor", "strengths", "weaknesses"],
          },
        },
        your_brand_strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
        your_brand_weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
        opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        "brand_name",
        "competitors",
        "your_brand_strengths",
        "your_brand_weaknesses",
        "opportunities",
      ],
    },
    top_5_target_search_queries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING },
          platform: { type: Type.STRING },
          intent: { type: Type.STRING },
          target_audience: { type: Type.STRING },
        },
        required: ["query", "platform", "intent", "target_audience"],
      },
    },
    seo_improvement: {
      type: Type.OBJECT,
      properties: {
        primary_keyword: { type: Type.STRING },
        secondary_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        seo_title: { type: Type.STRING },
        meta_description: { type: Type.STRING },
        content_ideas: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        "primary_keyword",
        "secondary_keywords",
        "seo_title",
        "meta_description",
        "content_ideas",
      ],
    },
    top_5_services: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["name", "description"],
      },
    },
    target_audience_identification: {
      type: Type.OBJECT,
      properties: {
        primary_audience: { type: Type.STRING },
        secondary_audience: { type: Type.STRING },
        industries: { type: Type.ARRAY, items: { type: Type.STRING } },
        customer_needs: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommended_segments: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        "primary_audience",
        "secondary_audience",
        "industries",
        "customer_needs",
        "recommended_segments",
      ],
    },
  },
  required: [
    "competitor_vs_your_brand",
    "top_5_target_search_queries",
    "seo_improvement",
    "top_5_services",
    "target_audience_identification",
  ],
};

/**
 * Validates that the raw model output conforms to LinkScope's canonical report structure
 * and normalizes missing sub-properties to ensure stability across models.
 */
export function validateAndNormalizeAnalysis(raw: any): LinkAnalysisData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidModelResponseError("Model response is not a valid JSON object.");
  }

  // 1. Competitor Analysis Section
  const comp = raw.competitor_vs_your_brand;
  if (!comp || typeof comp !== "object") {
    throw new InvalidModelResponseError("Missing required 'competitor_vs_your_brand' section.");
  }

  const normalizedCompetitors = Array.isArray(comp.competitors)
    ? comp.competitors.map((c: any) => ({
        name: String(c?.name || "Competitor (inferred)"),
        why_competitor: String(c?.why_competitor || "Market alternative"),
        strengths: Array.isArray(c?.strengths) ? c.strengths.map(String) : [],
        weaknesses: Array.isArray(c?.weaknesses) ? c.weaknesses.map(String) : [],
      }))
    : [];

  const competitorSection = {
    brand_name: String(comp.brand_name || "Your Brand"),
    competitors: normalizedCompetitors,
    your_brand_strengths: Array.isArray(comp.your_brand_strengths)
      ? comp.your_brand_strengths.map(String)
      : [],
    your_brand_weaknesses: Array.isArray(comp.your_brand_weaknesses)
      ? comp.your_brand_weaknesses.map(String)
      : [],
    opportunities: Array.isArray(comp.opportunities)
      ? comp.opportunities.map(String)
      : [],
  };

  // 2. Search Queries Section
  const rawQueries = raw.top_5_target_search_queries;
  if (!Array.isArray(rawQueries)) {
    throw new InvalidModelResponseError("Missing required 'top_5_target_search_queries' array.");
  }

  const normalizedQueries = rawQueries.map((q: any) => ({
    query: String(q?.query || "target search query"),
    platform: String(q?.platform || "Google Search"),
    intent: String(q?.intent || "Commercial"),
    target_audience: String(q?.target_audience || "General audience"),
  }));

  // 3. SEO Section
  const seo = raw.seo_improvement;
  if (!seo || typeof seo !== "object") {
    throw new InvalidModelResponseError("Missing required 'seo_improvement' section.");
  }

  const seoSection = {
    primary_keyword: String(seo.primary_keyword || "website intelligence"),
    secondary_keywords: Array.isArray(seo.secondary_keywords)
      ? seo.secondary_keywords.map(String)
      : [],
    seo_title: String(seo.seo_title || "Website Intelligence Report"),
    meta_description: String(seo.meta_description || "Comprehensive website analysis."),
    content_ideas: Array.isArray(seo.content_ideas)
      ? seo.content_ideas.map(String)
      : [],
  };

  // 4. Services Section
  const rawServices = raw.top_5_services;
  if (!Array.isArray(rawServices)) {
    throw new InvalidModelResponseError("Missing required 'top_5_services' array.");
  }

  const normalizedServices = rawServices.map((s: any) => ({
    name: String(s?.name || "Core Service"),
    description: String(s?.description || "Description of service."),
  }));

  // 5. Target Audience Section
  const aud = raw.target_audience_identification;
  if (!aud || typeof aud !== "object") {
    throw new InvalidModelResponseError("Missing required 'target_audience_identification' section.");
  }

  const audienceSection = {
    primary_audience: String(aud.primary_audience || "Target Customers"),
    secondary_audience: String(aud.secondary_audience || "Industry Professionals"),
    industries: Array.isArray(aud.industries) ? aud.industries.map(String) : [],
    customer_needs: Array.isArray(aud.customer_needs) ? aud.customer_needs.map(String) : [],
    recommended_segments: Array.isArray(aud.recommended_segments)
      ? aud.recommended_segments.map(String)
      : [],
  };

  return {
    competitor_vs_your_brand: competitorSection,
    top_5_target_search_queries: normalizedQueries,
    seo_improvement: seoSection,
    top_5_services: normalizedServices,
    target_audience_identification: audienceSection,
  };
}
