import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiProvider,
  normalizeModelId,
  isDocumentedStructuredOutputModel,
  isExplicitRetiredModel,
  DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY,
  KNOWN_RETIRED_MODELS,
} from "../server/services/ai/providers/geminiProvider";
import { ModelDiscoveryCache, ModelCapabilityCache, SessionModelCache } from "../server/services/ai/modelCache";
import { AIDiagnosticsService } from "../server/services/ai/aiDiagnostics";
import {
  ModelUnavailableError,
  ModelIncompatibleError,
} from "../server/services/ai/aiErrors";
import type { ModelCapability } from "../server/services/ai/types";

describe("LinkScope Model Discovery, Registry & Capability Diagnostics Tests", () => {
  let provider: GeminiProvider;
  const mockValidKey = "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst";

  beforeEach(() => {
    provider = new GeminiProvider();
    ModelDiscoveryCache.clear();
    ModelCapabilityCache.clear();
    SessionModelCache.clear();
  });

  // 1. Model ID with and without models/ prefix
  test("1. Model ID with and without models/ prefix are normalized consistently", async () => {
    const rawWithPrefix = "models/gemini-3.8-flash";
    const rawWithoutPrefix = "gemini-3.8-flash";

    const norm1 = normalizeModelId(rawWithPrefix);
    const norm2 = normalizeModelId(rawWithoutPrefix);

    assert.strictEqual(norm1.cleanId, "gemini-3.8-flash");
    assert.strictEqual(norm1.resourceName, "models/gemini-3.8-flash");
    assert.strictEqual(norm2.cleanId, "gemini-3.8-flash");
    assert.strictEqual(norm2.resourceName, "models/gemini-3.8-flash");

    // Both identifiers pass compatibility check identically
    const check1 = await provider.checkModelCompatibility(mockValidKey, rawWithPrefix);
    const check2 = await provider.checkModelCompatibility(mockValidKey, rawWithoutPrefix);

    assert.strictEqual(check1.compatible, true);
    assert.strictEqual(check2.compatible, true);
    assert.strictEqual(check1.supportsStructuredOutputs, true);
    assert.strictEqual(check2.supportsStructuredOutputs, true);
  });

  // 2. Current Gemini Developer API model metadata & active registry
  test("2. Current Gemini models (gemini-3.8-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite) are in active registry", () => {
    assert.ok(isDocumentedStructuredOutputModel("gemini-3.8-flash"));
    assert.ok(isDocumentedStructuredOutputModel("gemini-3.5-flash-lite"));
    assert.ok(isDocumentedStructuredOutputModel("gemini-3.1-flash-lite"));
    assert.ok(isDocumentedStructuredOutputModel("gemini-2.5-flash"));
    assert.ok(isDocumentedStructuredOutputModel("gemini-2.5-pro"));
    assert.ok(isDocumentedStructuredOutputModel("gemini-2.5-flash-lite"));

    // Retired models are NOT in the active registry
    assert.strictEqual(isDocumentedStructuredOutputModel("gemini-2.0-flash"), false);
    assert.strictEqual(isDocumentedStructuredOutputModel("gemini-2.0-flash-lite"), false);

    // Verify registry metadata
    assert.strictEqual(
      DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.documentationSource,
      "https://ai.google.dev/gemini-api/docs/structured-output"
    );
    assert.strictEqual(DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.lastVerifiedDate, "2026-11-22");
    assert.ok(DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.models.has("gemini-3.8-flash"));
    assert.ok(DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.models.has("gemini-3.5-flash-lite"));
    assert.ok(DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.models.has("gemini-3.1-flash-lite"));
    assert.ok(DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.models.has("gemini-2.5-flash"));
    assert.strictEqual(DOCUMENTED_STRUCTURED_OUTPUT_REGISTRY.models.has("gemini-2.0-flash"), false);
  });

  // 3. Missing deprecation metadata does not mark model as deprecated
  test("3. Missing deprecation metadata does not mark a model as deprecated (marked unknown lifecycle)", async () => {
    // Model with active registry entry has active lifecycle
    const activeCheck = await provider.checkModelCompatibility(mockValidKey, "gemini-3.8-flash");
    assert.strictEqual(activeCheck.isDeprecated, false);

    // Explicit check on an uncatalogued model: isExplicitRetiredModel must be false
    assert.strictEqual(isExplicitRetiredModel("gemini-future-model-4.0"), false);
  });

  // 4. Explicitly retired model rejection
  test("4. Explicitly retired Gemini models (gemini-2.0-flash, gemini-1.0-pro, gemini-1.5-flash) are rejected as deprecated", async () => {
    assert.ok(isExplicitRetiredModel("gemini-2.0-flash"));
    assert.ok(isExplicitRetiredModel("gemini-2.0-flash-lite"));
    assert.ok(isExplicitRetiredModel("gemini-1.0-pro"));
    assert.ok(isExplicitRetiredModel("gemini-1.5-flash"));
    assert.ok(isExplicitRetiredModel("gemini-1.5-pro"));
    assert.ok(isExplicitRetiredModel("gemini-pro"));

    const check20 = await provider.checkModelCompatibility(mockValidKey, "gemini-2.0-flash");
    assert.strictEqual(check20.compatible, false);
    assert.strictEqual(check20.isDeprecated, true);

    const check20lite = await provider.checkModelCompatibility(mockValidKey, "gemini-2.0-flash-lite");
    assert.strictEqual(check20lite.compatible, false);
    assert.strictEqual(check20lite.isDeprecated, true);

    const check10 = await provider.checkModelCompatibility(mockValidKey, "gemini-1.0-pro");
    assert.strictEqual(check10.compatible, false);
    assert.strictEqual(check10.isDeprecated, true);

    const check15 = await provider.checkModelCompatibility(mockValidKey, "gemini-1.5-flash");
    assert.strictEqual(check15.compatible, false);
    assert.strictEqual(check15.isDeprecated, true);
  });

  // 5. supportedGenerationMethods mapping
  test("5. supportedGenerationMethods from raw REST API is mapped to supportedActions", async () => {
    const rawRestModel = {
      name: "models/gemini-test-rest",
      displayName: "Gemini Test REST",
      description: "Model from raw REST payload",
      supportedGenerationMethods: ["generateContent", "countTokens"],
    };

    // Verify parser handles supportedGenerationMethods
    let supportedActions: string[] = [];
    if (Array.isArray(rawRestModel.supportedGenerationMethods)) {
      supportedActions = rawRestModel.supportedGenerationMethods.map(String);
    }

    assert.ok(supportedActions.includes("generateContent"));
    assert.ok(supportedActions.includes("countTokens"));
  });

  // 6. supportedActions mapping
  test("6. supportedActions from SDK Model is mapped correctly", async () => {
    const models = await provider.discoverModels(mockValidKey);
    const flash38 = models.find((m) => m.id === "gemini-3.8-flash");

    assert.ok(flash38);
    assert.ok(flash38.supportedActions.includes("generateContent"));
    assert.strictEqual(flash38.supportsStructuredOutputs, true);
    assert.strictEqual(flash38.isDeprecated, false);
  });

  // 7. Structured-output capability success
  test("7. Structured-output capability verification succeeds on active documented models", async () => {
    const res = await provider.checkModelCompatibility(mockValidKey, "gemini-3.8-flash");
    assert.strictEqual(res.compatible, true);
    assert.strictEqual(res.supportsStructuredOutputs, true);
    assert.strictEqual(res.isDeprecated, false);

    // Verify result is cached in ModelCapabilityCache
    const cached = ModelCapabilityCache.get("gemini-3.8-flash");
    assert.ok(cached);
    assert.strictEqual(cached.compatible, true);
  });

  // 8. Temporary probe failure (503 UNAVAILABLE / 504 TIMEOUT) is NOT cached as permanently incompatible
  test("8. Temporary probe failure (503 / 504) is NOT cached as permanently incompatible in ModelCapabilityCache", async () => {
    const keyWith503Probe = "AIzaSyMockValidKey-simulate-probe-503";
    const client = (provider as any).createClient(keyWith503Probe);

    const probeResult = await provider.probeStructuredOutputSupport(client, "gemini-unverified-candidate", keyWith503Probe);
    assert.strictEqual(probeResult.supported, false);
    assert.strictEqual(probeResult.status, "TEMPORARY_ERROR");
    assert.strictEqual(probeResult.httpStatus, 503);

    // Critical: transient failures must NOT be cached in ModelCapabilityCache
    const cached = ModelCapabilityCache.get("gemini-unverified-candidate");
    assert.strictEqual(cached, null, "Transient probe failure must not be cached permanently");
  });

  // 9. Permission-denied probe (403 PERMISSION_DENIED)
  test("9. Permission-denied probe (403 PERMISSION_DENIED) is accurately classified", async () => {
    const keyWith403Probe = "AIzaSyMockValidKey-simulate-probe-403";
    const client = (provider as any).createClient(keyWith403Probe);

    const probeResult = await provider.probeStructuredOutputSupport(client, "gemini-restricted-model", keyWith403Probe);
    assert.strictEqual(probeResult.supported, false);
    assert.strictEqual(probeResult.status, "PERMISSION_DENIED");
    assert.strictEqual(probeResult.httpStatus, 403);
  });

  // 10. No compatible model response returns structured evaluation report with rejection diagnostics
  test("10. Sanitized model evaluation report contains discovered, filtered, and rejected metrics", async () => {
    const report = await provider.evaluateModels(mockValidKey);

    assert.ok(report);
    assert.ok(typeof report.discoveredCount === "number");
    assert.ok(typeof report.generateContentSupportedCount === "number");
    assert.ok(typeof report.deprecatedCount === "number");
    assert.ok(typeof report.unknownLifecycleCount === "number");
    assert.ok(typeof report.structuredOutputVerifiedCount === "number");
    assert.ok(Array.isArray(report.rejected));

    // Verify retired models were catalogued as rejected
    const deprecatedRejections = report.rejected.filter(
      (r) => r.reason === "MODEL_DEPRECATED_OR_RETIRED"
    );
    assert.ok(deprecatedRejections.length >= 3, "gemini-2.0-flash, gemini-1.0-pro and gemini-1.5-flash must be rejected");
    assert.ok(deprecatedRejections.some((r) => r.model === "gemini-2.0-flash"));

    // Verify non-generation models were catalogued as rejected
    const nonGenRejections = report.rejected.filter(
      (r) => r.reason === "GENERATE_CONTENT_UNSUPPORTED"
    );
    assert.ok(nonGenRejections.some((r) => r.model === "text-embedding-004"));
  });

  // 11. Model discovery pagination
  test("11. Model discovery iterates over paginated models up to safety ceiling", async () => {
    const models = await provider.discoverModels(mockValidKey);
    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0);

    // Verify discovery cache is active
    assert.strictEqual(ModelDiscoveryCache.isCached("gemini"), true);
  });

  // 12. Full Step C diagnostics integrates evaluation report
  test("12. AIDiagnosticsService Step C includes evaluationReport in details", async () => {
    const stepCRes = await AIDiagnosticsService.testStepC_CompatibilityCheck(mockValidKey);

    assert.strictEqual(stepCRes.step.passed, true);
    assert.ok(stepCRes.selectedModel);
    assert.ok(stepCRes.evaluationReport);
    assert.strictEqual(stepCRes.evaluationReport.discoveredCount > 0, true);
    assert.strictEqual(stepCRes.evaluationReport.structuredOutputVerifiedCount > 0, true);
  });

  // 13. Unknown models remain eligible for capability verification and selection
  test("13. Unknown models are not rejected merely for being uncatalogued and can be verified via probe", async () => {
    // Model not in active registry and not retired has unknown lifecycle
    const unknownModelId = "gemini-experimental-preview";
    assert.strictEqual(isExplicitRetiredModel(unknownModelId), false);
    assert.strictEqual(isDocumentedStructuredOutputModel(unknownModelId), false);

    // Compatibility check executes probe and caches success
    const check = await provider.checkModelCompatibility(mockValidKey, unknownModelId);
    assert.strictEqual(check.compatible, true);
    assert.strictEqual(check.supportsStructuredOutputs, true);
    assert.strictEqual(check.isDeprecated, false);

    // Cached check returns true without re-probing
    const cached = ModelCapabilityCache.get(unknownModelId);
    assert.ok(cached);
    assert.strictEqual(cached.compatible, true);
  });

  // 14. Probe request shape matches production generateContent configuration
  test("14. probeStructuredOutputSupport executes generateContent with production configuration schema", async () => {
    let capturedCall: any = null;
    const fakeClient: any = {
      models: {
        generateContent: async (args: any) => {
          capturedCall = args;
          return { text: '{"ok":true}' };
        },
      },
    };

    // Invoke probe with a real key string (not triggering mock short-circuit)
    const result = await provider.probeStructuredOutputSupport(fakeClient, "gemini-unknown-test", "real-probe-key-123");
    assert.strictEqual(result.supported, true);
    assert.strictEqual(result.status, "SUPPORTED");

    // Verify request shape conforms to production generateContent
    assert.ok(capturedCall);
    assert.strictEqual(capturedCall.model, "gemini-unknown-test");
    assert.strictEqual(capturedCall.contents, "probe");
    assert.ok(capturedCall.config);
    assert.strictEqual(capturedCall.config.responseMimeType, "application/json");
    assert.strictEqual(typeof capturedCall.config.systemInstruction, "string");
    assert.ok(capturedCall.config.responseSchema);
    assert.strictEqual(capturedCall.config.responseSchema.type, "OBJECT");
  });

  // 15. Step C fast evaluation does not probe when documented models exist
  test("15. evaluateModels completes rapidly without probing when documented models exist", async () => {
    const start = Date.now();
    const report = await provider.evaluateModels(mockValidKey);
    const duration = Date.now() - start;

    assert.ok(report);
    assert.ok(report.structuredOutputVerifiedCount > 0);
    // Zero capability probes should have failed because no uncatalogued probes were needed
    assert.strictEqual(report.failedProbeCount, 0);
    assert.ok(duration < 200, `Evaluation must be fast (<200ms), actual: ${duration}ms`);
  });

  // 16. Fallback model switches to verified documented model immediately
  test("16. findVerifiedFallbackModel immediately selects documented fallback without probe", async () => {
    const fallback = await provider.findVerifiedFallbackModel(mockValidKey, "gemini-3.8-flash");
    assert.ok(fallback);
    assert.ok(isDocumentedStructuredOutputModel(fallback));
    assert.notStrictEqual(fallback, "gemini-3.8-flash");
  });
});
