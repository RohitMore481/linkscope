import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { GeminiProvider } from "../server/services/ai/providers/geminiProvider";
import { ModelDiscoveryCache, SessionModelCache } from "../server/services/ai/modelCache";
import {
  ProviderServiceError,
  QuotaExceededError,
  ApiPermissionDeniedError,
  ProviderTimeoutError,
} from "../server/services/ai/aiErrors";
import { createApp } from "../server";
import { RateLimiterService } from "../server/services/rateLimiterService";

describe("LinkScope Gemini 503 UNAVAILABLE Retry & Resilience Suite", () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider();
    ModelDiscoveryCache.clear();
    SessionModelCache.clear();
    RateLimiterService.resetAll();
  });

  // 1. 503 on first attempt followed by success on attempt 2
  test("1. 503 on first attempt followed by success on attempt 2 succeeds", async () => {
    const key = "AIzaSyMockValidKey-simulate-retry-503-succeeds";
    const result = await provider.generateAnalysis(key, "Sample website prompt text");

    assert.ok(result);
    assert.strictEqual(result.provider, "gemini");
    assert.ok(result.analysis.competitor_vs_your_brand);
    assert.ok(result.analysis.top_5_target_search_queries);
    assert.ok(result.analysis.seo_improvement);
    assert.ok(result.analysis.top_5_services);
    assert.ok(result.analysis.target_audience_identification);
  });

  // 2. Three consecutive 503 responses exhaust retries
  test("2. Three consecutive 503 responses exhaust retries and return PROVIDER_SERVICE_ERROR with retryable: true", async () => {
    const key = "AIzaSyMockValidKey-simulate-consecutive-503";

    await assert.rejects(
      () => provider.generateAnalysis(key, "Sample website prompt text"),
      (err: any) => {
        assert.ok(err instanceof ProviderServiceError);
        assert.strictEqual(err.code, "PROVIDER_SERVICE_ERROR");
        assert.strictEqual(err.retryable, true);
        assert.strictEqual(err.statusCode, 502);
        assert.strictEqual(
          err.message,
          "Gemini is temporarily experiencing high demand. Please try again shortly."
        );
        return true;
      }
    );
  });

  // 3. 503 followed by 429 halts retries immediately
  test("3. 503 followed by 429 RESOURCE_EXHAUSTED halts retries immediately without third attempt", async () => {
    const key = "AIzaSyMockValidKey-simulate-503-then-429";

    await assert.rejects(
      () => provider.generateAnalysis(key, "Sample website prompt text"),
      (err: any) => {
        assert.ok(err instanceof QuotaExceededError);
        assert.strictEqual(err.code, "QUOTA_EXCEEDED");
        assert.strictEqual(err.statusCode, 429);
        assert.strictEqual(err.retryable, false);
        return true;
      }
    );
  });

  // 4. 503 followed by 403 halts retries immediately
  test("4. 503 followed by 403 PERMISSION_DENIED halts retries immediately without third attempt", async () => {
    const key = "AIzaSyMockValidKey-simulate-503-then-403";

    await assert.rejects(
      () => provider.generateAnalysis(key, "Sample website prompt text"),
      (err: any) => {
        assert.ok(err instanceof ApiPermissionDeniedError);
        assert.strictEqual(err.code, "API_PERMISSION_DENIED");
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.retryable, false);
        return true;
      }
    );
  });

  // 5. Overall request deadline / timeout
  test("5. Timeout during generation raises PROVIDER_TIMEOUT", async () => {
    const key = "AIzaSyMockValidKey-simulate-timeout";

    await assert.rejects(
      () => provider.generateAnalysis(key, "Sample website prompt text"),
      (err: any) => {
        assert.ok(err instanceof ProviderTimeoutError);
        assert.strictEqual(err.code, "PROVIDER_TIMEOUT");
        assert.strictEqual(err.statusCode, 504);
        assert.strictEqual(err.retryable, true);
        return true;
      }
    );
  });

  // 6. Safe diagnostic extraction redacts keys and sensitive tokens
  test("6. Safe diagnostic extraction removes plain API keys and bearer tokens from diagnostics", () => {
    const sensitiveKey = "AIzaSyTestSecretKey1234567890ABCDEF";
    const sensitiveBearer = "Bearer ya29.a0AfH6SMA-secret-token-xyz";
    const rawError = new Error(
      `Call to https://generativelanguage.googleapis.com/v1beta/models?key=${sensitiveKey} failed with Authorization: ${sensitiveBearer}`
    );
    (rawError as any).status = 503;

    const diag = (provider as any).extractSafeDiagnostic(rawError, "gemini-3.8-flash", 1, 150);

    assert.strictEqual(diag.httpStatus, 503);
    assert.strictEqual(diag.modelId, "gemini-3.8-flash");
    assert.strictEqual(diag.attempt, 1);
    assert.strictEqual(diag.durationMs, 150);

    // Verify redaction
    assert.ok(!diag.sanitizedMessage.includes(sensitiveKey));
    assert.ok(!diag.sanitizedMessage.includes(sensitiveBearer));
    assert.ok(diag.sanitizedMessage.includes("[REDACTED"));
  });

  // 7. Full Express HTTP route verification: POST /api/analyze returns structured error
  test("7. POST /api/analyze returns structured PROVIDER_SERVICE_ERROR on 503 retry exhaustion", async () => {
    const app = createApp();

    const mockRequest = (
      method: string,
      path: string,
      body: any = null,
      headers: Record<string, string> = {}
    ): Promise<{ statusCode: number; body: any; headers: any; cookies: any }> => {
      return new Promise((resolve) => {
        const reqCookies: Record<string, string> = {};
        if (headers["cookie"]) {
          const parts = headers["cookie"].split(";");
          for (const p of parts) {
            const [k, v] = p.trim().split("=");
            if (k && v) reqCookies[k] = decodeURIComponent(v);
          }
        }

        const req: any = {
          method,
          url: path,
          originalUrl: path,
          path,
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
          connection: { remoteAddress: "127.0.0.1" },
          headers: {
            host: "localhost:4000",
            origin: "http://localhost:4000",
            ...headers,
          },
          body: body || {},
          cookies: reqCookies,
          get(name: string) {
            return this.headers[name.toLowerCase()];
          },
          header(name: string) {
            return this.headers[name.toLowerCase()];
          },
        };

        let statusCode = 200;
        let responseBody: any = null;
        const resHeaders: Record<string, string | string[]> = {};
        const resCookies: Record<string, any> = {};

        const res: any = {
          status(code: number) {
            statusCode = code;
            this.statusCode = code;
            return this;
          },
          setHeader(name: string, val: string | string[]) {
            resHeaders[name.toLowerCase()] = val;
            return this;
          },
          header(name: string, val: string | string[]) {
            resHeaders[name.toLowerCase()] = val;
            return this;
          },
          getHeader(name: string) {
            return resHeaders[name.toLowerCase()];
          },
          cookie(name: string, val: string, opts: any) {
            resCookies[name] = { value: val, options: opts };
            resHeaders["set-cookie"] = `${name}=${val}; Path=${opts?.path || "/"}`;
            return this;
          },
          clearCookie(name: string) {
            delete resCookies[name];
            resHeaders["set-cookie"] = `${name}=; Path=/; Max-Age=0`;
            return this;
          },
          json(data: any) {
            responseBody = data;
            resolve({ statusCode, body: responseBody, headers: resHeaders, cookies: resCookies });
            return this;
          },
          send(data: any) {
            responseBody = data;
            resolve({ statusCode, body: responseBody, headers: resHeaders, cookies: resCookies });
            return this;
          },
          end() {
            resolve({ statusCode, body: responseBody, headers: resHeaders, cookies: resCookies });
            return this;
          },
        };

        (app as any).handle(req, res, (err: any) => {
          if (err) {
            resolve({ statusCode: 500, body: { error: err.message }, headers: resHeaders, cookies: resCookies });
          } else {
            resolve({ statusCode, body: responseBody, headers: resHeaders, cookies: resCookies });
          }
        });
      });
    };

    // Activate session with simulate-consecutive-503 test key
    const activateRes = await mockRequest(
      "POST",
      "/api/v1/session/activate",
      { apiKey: "AIzaSyMockValidKey-simulate-consecutive-503" },
      { "content-type": "application/json" }
    );

    assert.strictEqual(activateRes.statusCode, 200);
    const cookieHeader = activateRes.headers["set-cookie"];
    const sessionCookie = String(cookieHeader).split(";")[0];

    // Request analysis for mock.test URL
    const analyzeRes = await mockRequest(
      "POST",
      "/api/analyze",
      { url: "https://mock.test/example-site" },
      {
        "content-type": "application/json",
        cookie: sessionCookie,
      }
    );

    // Verify structured response conforms to LinkScope contract
    assert.strictEqual(analyzeRes.statusCode, 502);
    assert.strictEqual(analyzeRes.body.status, "error");
    assert.strictEqual(analyzeRes.body.error, "PROVIDER_SERVICE_ERROR");
    assert.strictEqual(
      analyzeRes.body.message,
      "Gemini is temporarily experiencing high demand. Please try again shortly."
    );
    assert.strictEqual(analyzeRes.body.retryable, true);
  });

  // 8. Concurrency lock prevents overlapping analyses on the same session
  test("8. RateLimiterService concurrency lock prevents overlapping analyses on the same session", () => {
    const testSessionId = "test-session-" + crypto.randomBytes(8).toString("hex");

    // Acquire lock
    const firstLock = RateLimiterService.acquireConcurrencyLock(testSessionId);
    assert.strictEqual(firstLock, true);

    // Second lock attempt on same session must be rejected
    const secondLock = RateLimiterService.acquireConcurrencyLock(testSessionId);
    assert.strictEqual(secondLock, false);

    // Release lock
    RateLimiterService.releaseConcurrencyLock(testSessionId);

    // Now lock can be acquired again
    const thirdLock = RateLimiterService.acquireConcurrencyLock(testSessionId);
    assert.strictEqual(thirdLock, true);
    RateLimiterService.releaseConcurrencyLock(testSessionId);
  });
});
