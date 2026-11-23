import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../server/services/ai/providers/geminiProvider";
import { AIService } from "../server/services/ai/aiService";
import { ModelDiscoveryCache, SessionModelCache } from "../server/services/ai/modelCache";
import {
  AIError,
  InvalidApiKeyError,
  MalformedApiKeyError,
  QuotaExceededError,
  ModelUnavailableError,
  ModelIncompatibleError,
  ProviderUnavailableError,
  ProviderNetworkError,
  ProviderTimeoutError,
  InvalidModelResponseError,
  GenerationTimeoutError,
  classifyAIError,
} from "../server/services/ai/aiErrors";
import {
  SYSTEM_INSTRUCTION,
  ANALYSIS_RESPONSE_SCHEMA,
  validateAndNormalizeAnalysis,
} from "../server/services/ai/schema";
import type { AIProvider } from "../server/services/ai/types";

describe("AI Provider Architecture & Model Independence Tests", () => {
  let provider: GeminiProvider;
  const mockValidKey = "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst";

  beforeEach(() => {
    provider = new GeminiProvider();
    ModelDiscoveryCache.clear();
  });

  // 1. Provider Interface
  test("1. Provider interface conforms to AIProvider contract", () => {
    assert.strictEqual(provider.id, "gemini");
    assert.strictEqual(typeof provider.name, "string");
    assert.strictEqual(typeof provider.verifyApiKey, "function");
    assert.strictEqual(typeof provider.discoverModels, "function");
    assert.strictEqual(typeof provider.checkModelCompatibility, "function");
    assert.strictEqual(typeof provider.selectCompatibleModel, "function");
    assert.strictEqual(typeof provider.generateAnalysis, "function");
  });

  // 2. Model Discovery & Caching
  test("2. Discovers available models and caches results", async () => {
    const models = await provider.discoverModels(mockValidKey);
    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0);

    // Verify properties on discovered models
    const flash = models.find((m) => m.id === "gemini-3.8-flash");
    assert.ok(flash, "gemini-3.8-flash must be present");
    assert.strictEqual(flash.isDeprecated, false);
    assert.strictEqual(flash.supportsStructuredOutputs, true);
    assert.ok(flash.supportedActions.includes("generateContent"));

    // Verify discovery cache is populated
    const cached = ModelDiscoveryCache.get("gemini");
    assert.ok(cached !== null);
    assert.strictEqual(cached.length, models.length);

    // Verify cache hit
    const secondCall = await provider.discoverModels(mockValidKey);
    assert.strictEqual(secondCall, cached);
  });

  // 3. Model Compatibility Checking
  test("3. Model compatibility checking identifies compatible, incompatible, and deprecated models", async () => {
    // Modern compatible model
    const compatible = await provider.checkModelCompatibility(mockValidKey, "gemini-3.8-flash");
    assert.strictEqual(compatible.compatible, true);
    assert.strictEqual(compatible.supportsStructuredOutputs, true);
    assert.strictEqual(compatible.isDeprecated, false);

    // Deprecated model
    const deprecated = await provider.checkModelCompatibility(mockValidKey, "gemini-1.0-pro");
    assert.strictEqual(deprecated.compatible, false);
    assert.strictEqual(deprecated.isDeprecated, true);
    assert.ok(deprecated.reason?.includes("deprecated"));

    // Non-generation / embedding model
    const embedding = await provider.checkModelCompatibility(mockValidKey, "text-embedding-004");
    assert.strictEqual(embedding.compatible, false);
    assert.strictEqual(embedding.supportsStructuredOutputs, false);
  });

  // 4. Automatic Model Selection ("auto")
  test("4. Automatic compatible-model selection picks the highest ranked non-deprecated model", async () => {
    const selected = await provider.selectCompatibleModel(mockValidKey, "auto");
    assert.ok(typeof selected === "string");
    // Should prioritize latest fast workhorse model
    assert.ok(selected.includes("flash"));
    assert.ok(!selected.includes("1.0")); // Never a deprecated model
  });

  // 5. Explicit Model Selection
  test("5. Explicit model selection validates model or throws ModelIncompatibleError", async () => {
    // Valid explicit model
    const selected = await provider.selectCompatibleModel(mockValidKey, "gemini-3.8-flash");
    assert.strictEqual(selected, "gemini-3.8-flash");

    // Incompatible / deprecated model throws
    await assert.rejects(
      () => provider.selectCompatibleModel(mockValidKey, "gemini-1.0-pro"),
      ModelIncompatibleError
    );

    // Non-text generation model throws
    await assert.rejects(
      () => provider.selectCompatibleModel(mockValidKey, "text-embedding-004"),
      ModelIncompatibleError
    );
  });

  // 6. Model Unavailable & Provider Unavailable Errors
  test("6. Model and Provider errors are normalized and distinct from InvalidApiKeyError", async () => {
    // Model Unavailable
    const unavailableErr = new Error("models/gemini-unknown-xyz is not found");
    const classifiedUnavailable = classifyAIError(unavailableErr, "gemini-unknown-xyz");
    assert.ok(classifiedUnavailable instanceof ModelUnavailableError);
    assert.ok(!(classifiedUnavailable instanceof InvalidApiKeyError));
    assert.strictEqual(classifiedUnavailable.code, "MODEL_UNAVAILABLE");

    // Provider Unavailable / Network error
    const netErr = new Error("fetch failed with ECONNREFUSED");
    const classifiedNet = classifyAIError(netErr);
    assert.ok(classifiedNet instanceof ProviderUnavailableError || classifiedNet instanceof ProviderNetworkError);
    assert.ok(classifiedNet.code === "PROVIDER_NETWORK_ERROR" || classifiedNet.code === "PROVIDER_UNAVAILABLE");
    assert.strictEqual(classifiedNet.statusCode, 503);

    // Generation Timeout
    const timeoutErr = new Error("The operation timed out after 25000ms");
    const classifiedTimeout = classifyAIError(timeoutErr);
    assert.ok(classifiedTimeout instanceof GenerationTimeoutError || classifiedTimeout instanceof ProviderTimeoutError);
    assert.ok(classifiedTimeout.code === "GENERATION_TIMEOUT" || classifiedTimeout.code === "PROVIDER_TIMEOUT");
    assert.strictEqual(classifiedTimeout.statusCode, 504);
  });

  // 7. Structured Analysis Output Validation & Normalization
  test("7. Validates and normalizes model output according to canonical 5-section report contract", () => {
    const validRaw = {
      competitor_vs_your_brand: {
        brand_name: "BrandX",
        competitors: [
          {
            name: "CompA",
            why_competitor: "Direct rival",
            strengths: ["Scale"],
            weaknesses: ["Speed"],
          },
        ],
        your_brand_strengths: ["Innovation"],
        your_brand_weaknesses: ["New"],
        opportunities: ["Expansion"],
      },
      top_5_target_search_queries: [
        { query: "best tool", platform: "Google Search", intent: "Commercial", target_audience: "SMB" },
      ],
      seo_improvement: {
        primary_keyword: "seo software",
        secondary_keywords: ["seo audit"],
        seo_title: "Title",
        meta_description: "Description",
        content_ideas: ["Idea 1"],
      },
      top_5_services: [{ name: "Audit", description: "SEO Audit" }],
      target_audience_identification: {
        primary_audience: "Founders",
        secondary_audience: "Marketers",
        industries: ["Tech"],
        customer_needs: ["Growth"],
        recommended_segments: ["Startups"],
      },
    };

    const normalized = validateAndNormalizeAnalysis(validRaw);
    assert.strictEqual(normalized.competitor_vs_your_brand.brand_name, "BrandX");
    assert.strictEqual(normalized.top_5_target_search_queries.length, 1);
    assert.strictEqual(normalized.seo_improvement.primary_keyword, "seo software");
    assert.strictEqual(normalized.top_5_services[0].name, "Audit");
    assert.strictEqual(normalized.target_audience_identification.primary_audience, "Founders");

    // Missing major section throws InvalidModelResponseError
    assert.throws(
      () => validateAndNormalizeAnalysis({ competitor_vs_your_brand: {} }),
      InvalidModelResponseError
    );

    // Non-object throws InvalidModelResponseError
    assert.throws(() => validateAndNormalizeAnalysis("not an object"), InvalidModelResponseError);
  });

  // 8. AIService Facade & Provider Registry
  test("8. AIService registry delegates to configured provider and allows custom provider registration", async () => {
    const defaultProvider = AIService.getProvider();
    assert.strictEqual(defaultProvider.id, "gemini");

    // Custom test provider
    class MockCustomProvider implements AIProvider {
      public readonly id = "custom-mock";
      public readonly name = "Custom Mock Provider";
      public async verifyApiKey(): Promise<any> {
        return { valid: true, provider: this.id, model: "custom-v1", testedAt: new Date().toISOString() };
      }
      public async discoverModels(): Promise<any> {
        return [];
      }
      public async checkModelCompatibility(): Promise<any> {
        return { compatible: true, supportsStructuredOutputs: true, isDeprecated: false };
      }
      public async selectCompatibleModel(): Promise<string> {
        return "custom-v1";
      }
      public async generateAnalysis(): Promise<any> {
        return { analysis: {} as any, modelUsed: "custom-v1", provider: this.id };
      }
    }

    AIService.registerProvider(new MockCustomProvider());
    const retrieved = AIService.getProvider("custom-mock");
    assert.strictEqual(retrieved.id, "custom-mock");
    assert.strictEqual(retrieved.name, "Custom Mock Provider");
  });

  // 9. Structured Analysis Generation with Mock Key
  test("9. generateAnalysis produces stable normalized structure without model-specific leakage", async () => {
    const result = await provider.generateAnalysis(
      mockValidKey,
      "Sample website text for intelligence extraction"
    );

    assert.strictEqual(result.provider, "gemini");
    assert.ok(typeof result.modelUsed === "string");
    assert.ok(result.analysis.competitor_vs_your_brand);
    assert.ok(result.analysis.top_5_target_search_queries);
    assert.ok(result.analysis.seo_improvement);
    assert.ok(result.analysis.top_5_services);
    assert.ok(result.analysis.target_audience_identification);
  });

  // 10. SessionModelCache operations
  test("10. SessionModelCache stores, retrieves, and invalidates session model assignments", () => {
    const testSessionId = "sess-test-uuid-1234";
    SessionModelCache.clear();

    assert.strictEqual(SessionModelCache.get(testSessionId), null);

    SessionModelCache.set(testSessionId, "gemini-3.8-flash");
    assert.strictEqual(SessionModelCache.get(testSessionId), "gemini-3.8-flash");

    SessionModelCache.invalidate(testSessionId);
    assert.strictEqual(SessionModelCache.get(testSessionId), null);
  });

  // 11. Metadata-driven scoring and model selection with session caching
  test("11. selectCompatibleModel uses session cache and evaluates models using metadata capabilities", async () => {
    const testSessionId = "sess-cached-selection-456";
    SessionModelCache.clear();

    // First call selects model and caches it
    const selected1 = await provider.selectCompatibleModel(mockValidKey, "auto", testSessionId);
    assert.ok(typeof selected1 === "string");
    assert.strictEqual(SessionModelCache.get(testSessionId), selected1);

    // Explicit cache override returns cached value directly if compatible
    SessionModelCache.set(testSessionId, "gemini-3.5-flash-lite");
    const selected2 = await provider.selectCompatibleModel(mockValidKey, "auto", testSessionId);
    assert.strictEqual(selected2, "gemini-3.5-flash-lite");

    // Clear session cache
    SessionModelCache.invalidate(testSessionId);
  });
});
