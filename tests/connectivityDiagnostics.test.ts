import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../server/services/ai/providers/geminiProvider";
import { AIDiagnosticsService } from "../server/services/ai/aiDiagnostics";
import { ModelDiscoveryCache, ModelCapabilityCache, SessionModelCache } from "../server/services/ai/modelCache";
import {
  AIError,
  InvalidApiKeyError,
  ApiPermissionDeniedError,
  QuotaExceededError,
  ModelUnavailableError,
  ModelIncompatibleError,
  ProviderNetworkError,
  ProviderTimeoutError,
  ProviderServiceError,
  InvalidModelResponseError,
  classifyAIError,
} from "../server/services/ai/aiErrors";

describe("Gemini Provider Connectivity & Isolated Diagnostics Tests", () => {
  let provider: GeminiProvider;
  const mockValidKey = "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst";

  beforeEach(() => {
    provider = new GeminiProvider();
    ModelDiscoveryCache.clear();
    SessionModelCache.clear();
  });

  // 1. Successful key verification
  test("1. Successful key verification succeeds with valid test key", async () => {
    const res = await provider.verifyApiKey(mockValidKey);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.provider, "gemini");
    assert.ok(typeof res.model === "string");
  });

  // 2. Failed authentication (401 / 400 API_KEY_INVALID)
  test("2. Failed authentication produces INVALID_API_KEY", async () => {
    await assert.rejects(
      () => provider.verifyApiKey("AIzaSyInvalidKey123456789"),
      (err: any) => {
        assert.ok(err instanceof InvalidApiKeyError);
        assert.strictEqual(err.code, "INVALID_API_KEY");
        assert.strictEqual(err.statusCode, 401);
        return true;
      }
    );
  });

  // 3. Model discovery success & caching
  test("3. Model discovery succeeds and populates ModelDiscoveryCache", async () => {
    const models = await provider.discoverModels(mockValidKey);
    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0);
    assert.strictEqual(ModelDiscoveryCache.isCached("gemini"), true);
  });

  // 4. Model discovery timeout (PROVIDER_TIMEOUT)
  test("4. Discovery timeout is accurately classified as PROVIDER_TIMEOUT", async () => {
    await assert.rejects(
      () => provider.discoverModels("discovery-timeout-key-123"),
      (err: any) => {
        assert.ok(err instanceof ProviderTimeoutError);
        assert.strictEqual(err.code, "PROVIDER_TIMEOUT");
        assert.strictEqual(err.statusCode, 504);
        return true;
      }
    );
  });

  // 5. DNS failure (PROVIDER_NETWORK_ERROR)
  test("5. DNS resolution failure (ENOTFOUND) produces PROVIDER_NETWORK_ERROR", () => {
    const fetchDnsErr = new TypeError("fetch failed");
    (fetchDnsErr as any).cause = {
      code: "ENOTFOUND",
      hostname: "generativelanguage.googleapis.com",
      syscall: "getaddrinfo",
    };

    const classified = classifyAIError(fetchDnsErr, undefined, "Google Gemini");
    assert.ok(classified instanceof ProviderNetworkError);
    assert.strictEqual(classified.code, "PROVIDER_NETWORK_ERROR");
    assert.strictEqual(classified.statusCode, 503);
    assert.ok(classified.message.includes("DNS resolution failed"));
  });

  // 6. Google 403 response (API_PERMISSION_DENIED)
  test("6. Google 403 PERMISSION_DENIED response produces API_PERMISSION_DENIED", () => {
    const google403Json = JSON.stringify({
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        message: "Generative Language API has not been used in project 123456 before or it is disabled.",
        details: [{ reason: "SERVICE_DISABLED" }],
      },
    });

    const err = new Error(google403Json);
    (err as any).status = 403;

    const classified = classifyAIError(err, undefined, "Google Gemini");
    assert.ok(classified instanceof ApiPermissionDeniedError);
    assert.strictEqual(classified.code, "API_PERMISSION_DENIED");
    assert.strictEqual(classified.statusCode, 403);
    assert.ok(classified.message.includes("Generative Language API"));
  });

  // 7. Google 429 response (QUOTA_EXCEEDED)
  test("7. Google 429 RESOURCE_EXHAUSTED produces QUOTA_EXCEEDED", () => {
    const google429Json = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "Resource has been exhausted (e.g. check quota).",
      },
    });

    const err = new Error(google429Json);
    (err as any).status = 429;

    const classified = classifyAIError(err, undefined, "Google Gemini");
    assert.ok(classified instanceof QuotaExceededError);
    assert.strictEqual(classified.code, "QUOTA_EXCEEDED");
    assert.strictEqual(classified.statusCode, 429);
  });

  // 8. Google 404 model errors (MODEL_UNAVAILABLE)
  test("8. Google 404 NOT_FOUND produces MODEL_UNAVAILABLE with model identifier", () => {
    const google404Json = JSON.stringify({
      error: {
        code: 404,
        status: "NOT_FOUND",
        message: "models/gemini-unreleased-exp is not found for API version v1beta",
      },
    });

    const err = new Error(google404Json);
    (err as any).status = 404;

    const classified = classifyAIError(err, "gemini-unreleased-exp", "Google Gemini");
    assert.ok(classified instanceof ModelUnavailableError);
    assert.strictEqual(classified.code, "MODEL_UNAVAILABLE");
    assert.strictEqual(classified.statusCode, 404);
    assert.ok(classified.message.includes("gemini-unreleased-exp"));
  });

  // 9. Google 5xx errors (PROVIDER_SERVICE_ERROR)
  test("9. Google 503 UNAVAILABLE produces PROVIDER_SERVICE_ERROR (not generic network error)", () => {
    const google503Json = JSON.stringify({
      error: {
        code: 503,
        status: "UNAVAILABLE",
        message: "The service is temporarily unavailable.",
      },
    });

    const err = new Error(google503Json);
    (err as any).status = 503;

    const classified = classifyAIError(err, undefined, "Google Gemini");
    assert.ok(classified instanceof ProviderServiceError);
    assert.strictEqual(classified.code, "PROVIDER_SERVICE_ERROR");
    assert.strictEqual(classified.statusCode, 502);
  });

  // 10. Successful structured generation (5 sections contract)
  test("10. Successful structured generation returns all 5 canonical sections", async () => {
    const result = await provider.generateAnalysis(mockValidKey, "Scraped website content for test");
    assert.ok(result.analysis.competitor_vs_your_brand);
    assert.ok(result.analysis.top_5_target_search_queries);
    assert.ok(result.analysis.seo_improvement);
    assert.ok(result.analysis.top_5_services);
    assert.ok(result.analysis.target_audience_identification);
  });

  // 11. Invalid JSON response produces INVALID_MODEL_RESPONSE
  test("11. Malformed non-JSON output throws InvalidModelResponseError", () => {
    const rawBadJson = new SyntaxError("Unexpected token < in JSON at position 0");
    const classified = classifyAIError(rawBadJson, "gemini-3.8-flash", "Google Gemini");
    assert.ok(classified instanceof InvalidModelResponseError);
    assert.strictEqual(classified.code, "INVALID_MODEL_RESPONSE");
    assert.strictEqual(classified.statusCode, 502);
  });

  // 12. Cache invalidation on failure and explicit request
  test("12. Cache invalidation evicts cache entries", () => {
    ModelDiscoveryCache.set("gemini", [{ id: "test-m", rawId: "m", displayName: "M", description: "", supportedActions: [], supportsStructuredOutputs: true, isDeprecated: false }], 300);
    assert.strictEqual(ModelDiscoveryCache.isCached("gemini"), true);

    ModelDiscoveryCache.invalidate("gemini");
    assert.strictEqual(ModelDiscoveryCache.isCached("gemini"), false);

    SessionModelCache.set("sess-test-1", "gemini-3.5-flash-lite");
    assert.strictEqual(SessionModelCache.get("sess-test-1"), "gemini-3.5-flash-lite");

    SessionModelCache.invalidate("sess-test-1");
    assert.strictEqual(SessionModelCache.get("sess-test-1"), null);
  });

  // 13. Session isolation
  test("13. Session isolation ensures distinct sessions do not leak cached models", () => {
    SessionModelCache.set("sess-A", "gemini-3.5-flash-lite");
    SessionModelCache.set("sess-B", "gemini-3.8-flash");

    assert.strictEqual(SessionModelCache.get("sess-A"), "gemini-3.5-flash-lite");
    assert.strictEqual(SessionModelCache.get("sess-B"), "gemini-3.8-flash");

    SessionModelCache.invalidate("sess-A");
    assert.strictEqual(SessionModelCache.get("sess-A"), null);
    assert.strictEqual(SessionModelCache.get("sess-B"), "gemini-3.8-flash");
  });

  // 14. Isolated 4-Step Diagnostic Procedure (Step A, B, C, D)
  test("14. AIDiagnosticsService executes 4 isolated steps independently when runGeneration is true", async () => {
    const report = await AIDiagnosticsService.runDiagnostics(mockValidKey, { runGeneration: true });
    assert.strictEqual(report.provider, "gemini");
    assert.strictEqual(report.overallPassed, true);
    assert.strictEqual(report.steps.stepA_keyVerification.passed, true);
    assert.strictEqual(report.steps.stepB_modelDiscovery.passed, true);
    assert.strictEqual(report.steps.stepC_compatibilityCheck.passed, true);
    assert.strictEqual(report.steps.stepD_structuredGeneration.passed, true);
    assert.strictEqual(report.steps.stepD_structuredGeneration.skipped, undefined);
  });

  // 15. Isolated Diagnostic Procedure catches early failures without cascading
  test("15. AIDiagnosticsService pinpoints Step A failure accurately on invalid key", async () => {
    const report = await AIDiagnosticsService.runDiagnostics("AIzaSyInvalidKey123456789");
    assert.strictEqual(report.overallPassed, false);
    assert.strictEqual(report.failingStep, "A");
    assert.strictEqual(report.steps.stepA_keyVerification.passed, false);
    assert.strictEqual(report.steps.stepA_keyVerification.error?.code, "INVALID_API_KEY");
  });

  // 16. Default diagnostics separates low-cost discovery from potentially billable generation
  test("16. AIDiagnosticsService skips Step D generation by default to prevent unwanted billable requests", async () => {
    const report = await AIDiagnosticsService.runDiagnostics(mockValidKey);
    assert.strictEqual(report.overallPassed, true);
    assert.strictEqual(report.steps.stepA_keyVerification.passed, true);
    assert.strictEqual(report.steps.stepB_modelDiscovery.passed, true);
    assert.strictEqual(report.steps.stepC_compatibilityCheck.passed, true);
    assert.strictEqual(report.steps.stepD_structuredGeneration.skipped, true);
  });

  // 17. ModelCapabilityCache stores, retrieves, and invalidates verified capability results
  test("17. ModelCapabilityCache stores and evicts capability probe results", () => {
    ModelCapabilityCache.clear();
    assert.strictEqual(ModelCapabilityCache.get("gemini-custom-probed"), null);

    ModelCapabilityCache.set("gemini-custom-probed", {
      compatible: true,
      supportsStructuredOutputs: true,
      isDeprecated: false,
    });
    const cached = ModelCapabilityCache.get("gemini-custom-probed");
    assert.ok(cached !== null);
    assert.strictEqual(cached?.compatible, true);
    assert.strictEqual(cached?.supportsStructuredOutputs, true);

    ModelCapabilityCache.invalidate("gemini-custom-probed");
    assert.strictEqual(ModelCapabilityCache.get("gemini-custom-probed"), null);
  });
});
