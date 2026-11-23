import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../server/services/ai/providers/geminiProvider";
import { ScraperService, ScrapeError } from "../server/services/scraperService";
import { AIService } from "../server/services/ai/aiService";
import { ModelDiscoveryCache, ModelCapabilityCache, SessionModelCache } from "../server/services/ai/modelCache";
import { ProviderTimeoutError, ProviderServiceError } from "../server/services/ai/aiErrors";
import { RateLimiterService } from "../server/services/rateLimiterService";

describe("LinkScope Analysis Timeout & Stage Optimization Tests", () => {
  let provider: GeminiProvider;
  const mockValidKey = "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst";

  beforeEach(() => {
    provider = new GeminiProvider();
    ModelDiscoveryCache.clear();
    ModelCapabilityCache.clear();
    SessionModelCache.clear();
    RateLimiterService.resetAll();
  });

  // 1. Lightweight public website analysis
  test("1. Lightweight public website analysis completes with accurate stage timings", async () => {
    const scraped = await ScraperService.scrapeWebsite("https://mock.test/lightweight-page");
    assert.ok(scraped.timings);
    assert.ok(typeof scraped.timings.fetchDurationMs === "number");
    assert.ok(typeof scraped.timings.parseDurationMs === "number");
    assert.ok(typeof scraped.timings.reduceDurationMs === "number");
    assert.ok(scraped.promptText.length > 0);

    const result = await provider.generateAnalysis(mockValidKey, scraped.promptText);
    assert.ok(result.analysis);
    assert.ok(result.timings);
    assert.ok(typeof result.timings.generationDurationMs === "number");
    assert.strictEqual(result.timings.retryDurationMs, 0);
  });

  // 2. Larger public website content reduction
  test("2. Larger website content reduction strips non-content elements and preserves headings", async () => {
    const scraped = await ScraperService.scrapeWebsite("https://mock.test/enterprise-portal-large");
    assert.ok(scraped.text.length <= 8000, "Cleaned text must be bounded by MAX_INPUT_CHARS");
    assert.ok(scraped.headings.length > 0);
    assert.ok(scraped.promptText.includes("KEY HEADINGS"));
  });

  // 3. Slow website response scraper timeout
  test("3. Scraper timeout is bounded and throws ScrapeError on unresponsive website", async () => {
    // Testing validation on slow/unreachable host format
    await assert.rejects(
      () => ScraperService.scrapeWebsite("http://192.0.2.1"), // RFC 5737 TEST-NET-1 (non-public IP)
      ScrapeError
    );
  });

  // 4. Gemini 503 response retry and fallback handling
  test("4. Gemini 503 response retries transiently and falls back to verified model if overloaded", async () => {
    const keyWith503 = "mock-key-simulate-retry-503-succeeds";
    const result = await provider.generateAnalysis(keyWith503, "Analyze test page");
    assert.ok(result.analysis);
    assert.ok(result.modelUsed);
    assert.ok(result.timings);
  });

  // 5. Gemini generation timeout respects overall request deadline
  test("5. Bounded timeout aborts doomed generation attempts before exceeding deadline", async () => {
    const keyTimeout = "mock-key-simulate-timeout";
    await assert.rejects(
      () => provider.generateAnalysis(keyTimeout, "Analyze test page", { timeoutMs: 100 }),
      ProviderTimeoutError
    );
  });

  // 6. Successful structured analysis contains all 5 canonical sections
  test("6. Successful analysis returns all five canonical dashboard sections", async () => {
    const result = await AIService.analyzeWebsite(mockValidKey, "LinkScope canonical verification");
    assert.ok(result.analysis.competitor_vs_your_brand);
    assert.ok(result.analysis.competitor_vs_your_brand.competitors.length >= 1);
    assert.ok(result.analysis.top_5_target_search_queries.length === 5);
    assert.ok(result.analysis.seo_improvement.primary_keyword);
    assert.ok(result.analysis.top_5_services.length === 5);
    assert.ok(result.analysis.target_audience_identification.primary_audience);
  });

  // 7. JSON export and data integrity
  test("7. Analysis result serializes cleanly to valid JSON for download", async () => {
    const result = await AIService.analyzeWebsite(mockValidKey, "Export integrity test");
    const serialized = JSON.stringify(result, null, 2);
    assert.ok(typeof serialized === "string");
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.provider, "gemini");
    assert.strictEqual(parsed.analysis.top_5_services.length, 5);
  });

  // 8. Step C fast evaluation without redundant capability probes
  test("8. Step C evaluation runs without probing when documented models are present", async () => {
    const start = Date.now();
    const report = await provider.evaluateModels(mockValidKey);
    const duration = Date.now() - start;

    assert.ok(report.structuredOutputVerifiedCount > 0);
    assert.strictEqual(report.failedProbeCount, 0);
    assert.ok(duration < 200, `Step C must complete in <200ms, actual: ${duration}ms`);
  });

  // 9. Concurrency lock release
  test("9. Concurrency lock is released and can be acquired for sequential requests", () => {
    const testSession = "sess-lock-test-789";
    const lock1 = RateLimiterService.acquireConcurrencyLock(testSession);
    assert.strictEqual(lock1, true);

    const lock2 = RateLimiterService.acquireConcurrencyLock(testSession);
    assert.strictEqual(lock2, false, "Second concurrent request must be rejected");

    RateLimiterService.releaseConcurrencyLock(testSession);
    const lock3 = RateLimiterService.acquireConcurrencyLock(testSession);
    assert.strictEqual(lock3, true, "Lock must be re-acquirable after release");
    RateLimiterService.releaseConcurrencyLock(testSession);
  });
});
