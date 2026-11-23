import { test, describe, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApp } from "../server";
import { InMemorySessionStore, SESSION_COOKIE_NAME } from "../server/services/sessionStore";
import { ApiKeyEncryptionService } from "../server/services/apiKeyEncryptionService";
import { GeminiClientFactory } from "../server/services/gemini/geminiClient";
import { requireSession } from "../server/middleware/sessionMiddleware";
import { validateCsrf } from "../server/middleware/csrfMiddleware";
import {
  InvalidApiKeyError,
  MalformedApiKeyError,
  QuotaExceededError,
  ModelUnavailableError,
  GeminiServiceError,
  classifyGeminiError,
} from "../server/services/gemini/geminiErrors";

describe("Anonymous Session BYOK Management & Lifecycle Tests", () => {
  const masterKey = crypto.randomBytes(32).toString("hex");
  const encryptionService = new ApiKeyEncryptionService(masterKey);
  let sessionStore: InMemorySessionStore;

  beforeEach(() => {
    sessionStore = new InMemorySessionStore(3600);
  });

  test("1. Different key lengths and prefixes are not rejected solely by format assumptions", () => {
    // 15-character key
    assert.strictEqual(
      GeminiClientFactory.validateKeyFormat("short-key-12345"),
      "short-key-12345"
    );

    // 39-character traditional key
    assert.strictEqual(
      GeminiClientFactory.validateKeyFormat("AIzaSyB_1234567890abcdefghijklmnopqrstuv"),
      "AIzaSyB_1234567890abcdefghijklmnopqrstuv"
    );

    // 70-character key with custom prefix
    const longKey = "custom_prefix_key_1234567890_abcdefghijklmnopqrstuvwxyz_0987654321_ext";
    assert.strictEqual(GeminiClientFactory.validateKeyFormat(longKey), longKey);

    // Key with sk- or other vendor-neutral prefix
    assert.strictEqual(
      GeminiClientFactory.validateKeyFormat("sk-gemini-test-key-without-assumed-prefix"),
      "sk-gemini-test-key-without-assumed-prefix"
    );
  });

  test("2. Leading and trailing whitespace is safely trimmed", () => {
    const raw = "   AIzaSyTrimmedKeyTest1234567890   ";
    assert.strictEqual(
      GeminiClientFactory.validateKeyFormat(raw),
      "AIzaSyTrimmedKeyTest1234567890"
    );
  });

  test("3. Embedded whitespace, tabs, and newlines are rejected with MalformedApiKeyError", () => {
    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("AIzaSy Embedded Space"),
      MalformedApiKeyError
    );

    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("AIzaSy\tKeyWithTab"),
      MalformedApiKeyError
    );

    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("AIzaSy\nKeyWithNewline"),
      MalformedApiKeyError
    );

    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("AIzaSy\r\nKeyWithCRLF"),
      MalformedApiKeyError
    );
  });

  test("4. Control characters are rejected with MalformedApiKeyError", () => {
    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("AIzaSy\x00NullByteKey"),
      MalformedApiKeyError
    );

    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("AIzaSy\x1bEscapeKey"),
      MalformedApiKeyError
    );
  });

  test("5. Empty keys and non-string inputs are rejected with MalformedApiKeyError", () => {
    assert.throws(() => GeminiClientFactory.validateKeyFormat(""), MalformedApiKeyError);
    assert.throws(() => GeminiClientFactory.validateKeyFormat("   "), MalformedApiKeyError);
    assert.throws(() => GeminiClientFactory.validateKeyFormat(null), MalformedApiKeyError);
    assert.throws(() => GeminiClientFactory.validateKeyFormat(undefined), MalformedApiKeyError);
    assert.throws(() => GeminiClientFactory.validateKeyFormat(12345 as any), MalformedApiKeyError);
  });

  test("6. Environment-variable assignment strings are rejected with MalformedApiKeyError", () => {
    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("GEMINI_API_KEY=AIzaSy1234567890"),
      MalformedApiKeyError
    );

    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("export GEMINI_API_KEY=AIzaSy1234567890"),
      MalformedApiKeyError
    );

    assert.throws(
      () => GeminiClientFactory.validateKeyFormat("API_KEY = AIzaSy1234567890"),
      MalformedApiKeyError
    );
  });

  test("7. Valid-looking keys with supported characters reach Gemini verification layer", async () => {
    const customKeyResult = await GeminiClientFactory.verifyKey("valid-custom-length-key-12345");
    assert.strictEqual(customKeyResult.valid, true);

    const prefixKeyResult = await GeminiClientFactory.verifyKey("custom_prefix_key_without_aizasy");
    assert.strictEqual(prefixKeyResult.valid, true);
  });

  test("8. Google invalid-key responses are classified into InvalidApiKeyError", async () => {
    await assert.rejects(
      () => GeminiClientFactory.verifyKey("google-rejected-key"),
      InvalidApiKeyError
    );
  });

  test("9. Google quota errors are classified into QuotaExceededError and NOT InvalidApiKeyError", async () => {
    await assert.rejects(
      () => GeminiClientFactory.verifyKey("quota-exceeded-key"),
      (err: any) => {
        assert.ok(err instanceof QuotaExceededError);
        assert.ok(!(err instanceof InvalidApiKeyError));
        assert.strictEqual(err.code, "QUOTA_EXCEEDED");
        return true;
      }
    );
  });

  test("creates anonymous session with cryptographically secure random session ID", async () => {
    const rawApiKey = "AIzaSySecretApiKeyToEncrypt1234567890";
    const encrypted = encryptionService.encrypt(rawApiKey);

    const session = await sessionStore.createSession(encrypted.serialized, 3600);

    assert.strictEqual(typeof session.sessionId, "string");
    // 32 bytes hex = 64 characters
    assert.strictEqual(session.sessionId.length, 64);
    assert.ok(session.expiresAt.getTime() > Date.now());

    // Verified encrypted in session store
    const stored = await sessionStore.getSession(session.sessionId);
    assert.ok(stored !== null);
    assert.ok(!stored.encryptedKey.includes(rawApiKey));
    assert.ok(stored.encryptedKey.startsWith("v1:"));

    // Decrypts cleanly in memory
    const decrypted = encryptionService.decrypt(stored.encryptedKey);
    assert.strictEqual(decrypted, rawApiKey);
  });

  test("session isolation: Session A cannot access or decrypt Session B's API key", async () => {
    const keyA = "AIzaSyKeyForSessionA1234567890abcdefghij";
    const keyB = "AIzaSyKeyForSessionB0987654321zyxwvutsrq";

    const encA = encryptionService.encrypt(keyA);
    const encB = encryptionService.encrypt(keyB);

    const sessionA = await sessionStore.createSession(encA.serialized, 3600);
    const sessionB = await sessionStore.createSession(encB.serialized, 3600);

    assert.notStrictEqual(sessionA.sessionId, sessionB.sessionId);

    const retrievedA = await sessionStore.getSession(sessionA.sessionId);
    const retrievedB = await sessionStore.getSession(sessionB.sessionId);

    assert.strictEqual(encryptionService.decrypt(retrievedA!.encryptedKey), keyA);
    assert.strictEqual(encryptionService.decrypt(retrievedB!.encryptedKey), keyB);
  });

  test("session deletion: logout deletes session and encrypted key permanently", async () => {
    const rawApiKey = "AIzaSyKeyToLogout1234567890abcdefghijklm";
    const enc = encryptionService.encrypt(rawApiKey);

    const session = await sessionStore.createSession(enc.serialized, 3600);
    const statusBefore = await sessionStore.getStatus(session.sessionId);
    assert.strictEqual(statusBefore.active, true);

    const deleted = await sessionStore.deleteSession(session.sessionId);
    assert.strictEqual(deleted, true);

    const retrievedAfter = await sessionStore.getSession(session.sessionId);
    assert.strictEqual(retrievedAfter, null);

    const statusAfter = await sessionStore.getStatus(session.sessionId);
    assert.strictEqual(statusAfter.active, false);
  });

  test("session TTL expiration: automatically invalidates and purges expired sessions", async () => {
    const rawApiKey = "AIzaSyExpiringSessionKey1234567890";
    const enc = encryptionService.encrypt(rawApiKey);

    // Create session with 1 second TTL
    const session = await sessionStore.createSession(enc.serialized, 1);
    const validImmediately = await sessionStore.getSession(session.sessionId);
    assert.ok(validImmediately !== null);

    // Wait 1.1 seconds for TTL to lapse
    await new Promise((r) => setTimeout(r, 1100));

    const expired = await sessionStore.getSession(session.sessionId);
    assert.strictEqual(expired, null);

    const status = await sessionStore.getStatus(session.sessionId);
    assert.strictEqual(status.active, false);
  });

  test("getStatus returns expiry information without ever exposing the key", async () => {
    const rawApiKey = "AIzaSyStatusCheckKey1234567890";
    const enc = encryptionService.encrypt(rawApiKey);

    const session = await sessionStore.createSession(enc.serialized, 1800);
    const status = await sessionStore.getStatus(session.sessionId);

    assert.strictEqual(status.active, true);
    assert.strictEqual(typeof status.expiresAt, "string");
    assert.ok(status.ttlRemaining! > 1700 && status.ttlRemaining! <= 1800);
    // Crucial: status must NOT contain apiKey or encryptedKey
    assert.strictEqual((status as any).apiKey, undefined);
    assert.strictEqual((status as any).encryptedKey, undefined);
  });
});

describe("Session Middleware & CSRF Security Tests", () => {
  const masterKey = crypto.randomBytes(32).toString("hex");
  const encryptionService = new ApiKeyEncryptionService(masterKey);

  test("requireSession rejects requests without session cookie or header with 401", async () => {
    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const mockReq: any = { cookies: {}, headers: {} };
    const mockRes: any = {
      status(c: number) {
        statusCode = c;
        return this;
      },
      json(b: any) {
        jsonBody = b;
        return this;
      },
    };

    await requireSession(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody.error, "UNAUTHORIZED");
    assert.strictEqual(nextCalled, false);
  });

  test("requireSession authenticates valid session cookie and attaches sessionData", async () => {
    const rawApiKey = "AIzaSyCookieSessionTestKey1234567890";
    const enc = encryptionService.encrypt(rawApiKey);
    const session = await (new InMemorySessionStore(3600)).createSession(enc.serialized, 3600);

    // Attach to real sessionStore singleton for middleware check
    const { sessionStore } = await import("../server/services/sessionStore");
    await sessionStore.createSession(enc.serialized, 3600);

    // Let's create directly on sessionStore
    const testSession = await sessionStore.createSession(enc.serialized, 3600);

    const mockReq: any = {
      cookies: { [SESSION_COOKIE_NAME]: testSession.sessionId },
      headers: {},
    };
    const mockRes: any = {};
    let nextCalled = false;

    await requireSession(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(mockReq.sessionData.id, testSession.sessionId);
    assert.strictEqual(mockReq.sessionData.encryptedKey, enc.serialized);
  });

  test("validateCsrf permits GET and HEAD requests without Origin", () => {
    let nextCalled = false;
    const mockReq: any = { method: "GET", headers: {} };
    const mockRes: any = {};

    validateCsrf(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
  });

  test("validateCsrf rejects cross-site requests with mismatched Origin on POST", () => {
    let statusCode = 0;
    const mockReq: any = {
      method: "POST",
      headers: {
        origin: "https://malicious-site.attacker.com",
        host: "linkscope.example.com",
      },
    };
    const mockRes: any = {
      status(c: number) {
        statusCode = c;
        return this;
      },
      json() {
        return this;
      },
    };
    let nextCalled = false;

    validateCsrf(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(nextCalled, false);
  });
});

describe("HTTP Regression Tests: Anonymous BYOK Activation & Session Lifecycle", () => {
  const app = createApp();

  interface TestResponse {
    statusCode: number;
    body: any;
    headers: Record<string, string | string[]>;
    cookies: Record<string, { value: string; options: any }>;
    clearedCookies: Record<string, any>;
  }

  function dispatch(options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<TestResponse> {
    return new Promise((resolve) => {
      const headers = { ...(options.headers || {}) };
      const lowerHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        lowerHeaders[k.toLowerCase()] = v;
      }

      const req: any = {
        method: options.method.toUpperCase(),
        url: options.url,
        originalUrl: options.url,
        path: options.url.split("?")[0],
        headers: lowerHeaders,
        rawHeaders: [],
        header(name: string) {
          return lowerHeaders[name.toLowerCase()];
        },
        get(name: string) {
          return lowerHeaders[name.toLowerCase()];
        },
        cookies: {},
        body: options.body,
        _body: options.body !== undefined,
        socket: { remoteAddress: "127.0.0.1" },
        ip: "127.0.0.1",
      };

      if (lowerHeaders.cookie) {
        const parts = lowerHeaders.cookie.split(";");
        for (const part of parts) {
          const [k, v] = part.trim().split("=");
          if (k && v) req.cookies[k] = decodeURIComponent(v);
        }
      }

      const resHeaders: Record<string, string | string[]> = {};
      const resCookies: Record<string, { value: string; options: any }> = {};
      const clearedCookies: Record<string, any> = {};

      let responseBody: any = null;
      let statusCode = 200;

      const res: any = {
        statusCode: 200,
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
        clearCookie(name: string, opts: any) {
          clearedCookies[name] = opts;
          delete resCookies[name];
          resHeaders["set-cookie"] = `${name}=; Path=${opts?.path || "/"}; Max-Age=0`;
          return this;
        },
        json(data: any) {
          responseBody = data;
          resolve({
            statusCode,
            body: responseBody,
            headers: resHeaders,
            cookies: resCookies,
            clearedCookies,
          });
          return this;
        },
        send(data: any) {
          responseBody = data;
          resolve({
            statusCode,
            body: responseBody,
            headers: resHeaders,
            cookies: resCookies,
            clearedCookies,
          });
          return this;
        },
        end() {
          resolve({
            statusCode,
            body: responseBody,
            headers: resHeaders,
            cookies: resCookies,
            clearedCookies,
          });
          return this;
        },
      };

      (app as any).handle(req, res, (err: any) => {
        if (err) {
          resolve({
            statusCode: 500,
            body: { error: err.message },
            headers: resHeaders,
            cookies: resCookies,
            clearedCookies,
          });
        } else {
          resolve({
            statusCode: 404,
            body: { error: "Not Found" },
            headers: resHeaders,
            cookies: resCookies,
            clearedCookies,
          });
        }
      });
    });
  }

  let activeCookie: string = "";

  test("1. Activation without a cookie succeeds with a valid test Gemini key and sets session cookie", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "AIzaSyTestValidKey1234567890abcdefghijklmnopqrst",
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, "success");
    assert.ok(typeof res.body.expiresAt === "string");

    // Must set session cookie
    assert.ok(res.cookies[SESSION_COOKIE_NAME]);
    const sessionCookie = res.cookies[SESSION_COOKIE_NAME];
    assert.ok(sessionCookie.value.length === 64);
    assert.strictEqual(sessionCookie.options.httpOnly, true);
    assert.strictEqual(sessionCookie.options.sameSite, "lax");

    activeCookie = `${SESSION_COOKIE_NAME}=${sessionCookie.value}`;
  });

  test("2. Activation without a cookie fails appropriately with 400 Bad Request on invalid key (NOT 401)", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "AIzaSyInvalidKey1234567890abcdefghijklmnopqrst",
      },
    });

    // CRITICAL: Must be 400 Bad Request, NOT 401 Unauthorized
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.status, "error");
    assert.strictEqual(res.body.error, "INVALID_API_KEY");
    assert.ok(res.body.detail.includes("invalid"));
  });

  test("3. Status check without a session cookie returns 401 Unauthorized", async () => {
    const res = await dispatch({
      method: "GET",
      url: "/api/v1/session/status",
      headers: {
        Origin: "http://localhost:4000",
      },
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, "UNAUTHORIZED");
  });

  test("4. Analysis request without a session cookie returns 401 Unauthorized", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/analyze",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        url: "https://mock.test/example-site",
      },
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, "UNAUTHORIZED");
  });

  test("5. Status check with the activated session cookie returns 200 OK and active: true", async () => {
    assert.ok(activeCookie, "activeCookie must have been captured in test 1");

    const res = await dispatch({
      method: "GET",
      url: "/api/v1/session/status",
      headers: {
        Origin: "http://localhost:4000",
        Cookie: activeCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.active, true);
    assert.ok(typeof res.body.expiresAt === "string");
    assert.ok(res.body.ttlRemaining > 0);
  });

  test("6. A valid session can analyze multiple websites", async () => {
    assert.ok(activeCookie, "activeCookie must have been captured in test 1");

    // Analysis Call #1
    const res1 = await dispatch({
      method: "POST",
      url: "/api/analyze",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
        Cookie: activeCookie,
      },
      body: {
        url: "https://mock.test/first-target-company",
      },
    });

    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.status, "success");
    assert.ok(res1.body.analysis.competitor_vs_your_brand);
    assert.ok(res1.body.analysis.top_5_target_search_queries.length === 5);
    assert.ok(res1.body.analysis.seo_improvement.primary_keyword);
    assert.ok(res1.body.analysis.top_5_services.length === 5);
    assert.ok(res1.body.analysis.target_audience_identification.primary_audience);
    assert.ok(res1.body.meta.timings);
    assert.ok(typeof res1.body.meta.timings.fetchMs === "number");
    assert.ok(typeof res1.body.meta.timings.parseMs === "number");
    assert.ok(typeof res1.body.meta.timings.reduceMs === "number");
    assert.ok(typeof res1.body.meta.timings.generationMs === "number");
    assert.ok(typeof res1.body.meta.timings.totalMs === "number");

    // Analysis Call #2 (proves reuse across multiple sites)
    const res2 = await dispatch({
      method: "POST",
      url: "/api/analyze",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
        Cookie: activeCookie,
      },
      body: {
        url: "https://mock.test/second-target-company",
      },
    });

    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.status, "success");
    assert.strictEqual(res2.body.url, "https://mock.test/second-target-company");
    assert.ok(res2.body.analysis.competitor_vs_your_brand);
  });

  test("7. Logout safely invalidates the session and subsequent requests return 401", async () => {
    assert.ok(activeCookie, "activeCookie must have been captured in test 1");

    const logoutRes = await dispatch({
      method: "POST",
      url: "/api/v1/session/logout",
      headers: {
        Origin: "http://localhost:4000",
        Cookie: activeCookie,
      },
    });

    assert.strictEqual(logoutRes.statusCode, 200);
    assert.strictEqual(logoutRes.body.status, "success");
    assert.ok(logoutRes.clearedCookies[SESSION_COOKIE_NAME]);

    // Subsequent status check must return 401 Unauthorized
    const statusRes = await dispatch({
      method: "GET",
      url: "/api/v1/session/status",
      headers: {
        Origin: "http://localhost:4000",
        Cookie: activeCookie,
      },
    });

    assert.strictEqual(statusRes.statusCode, 401);
  });

  test("8. Activation with pasted environment assignment returns 400 MALFORMED_API_KEY", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "GEMINI_API_KEY=AIzaSyTestValidKey1234567890",
      },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.status, "error");
    assert.strictEqual(res.body.error, "MALFORMED_API_KEY");
    assert.ok(res.body.detail.includes("environment variable assignment"));
  });

  test("9. Activation with embedded whitespace returns 400 MALFORMED_API_KEY", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "AIzaSyTest ValidKeyWithSpace",
      },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.status, "error");
    assert.strictEqual(res.body.error, "MALFORMED_API_KEY");
    assert.ok(res.body.detail.includes("embedded spaces"));
  });

  test("10. Activation with empty key returns 400 MALFORMED_API_KEY", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "   ",
      },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.status, "error");
    assert.strictEqual(res.body.error, "MALFORMED_API_KEY");
  });

  test("11. Activation with Google quota error returns 429 QUOTA_EXCEEDED (not classified as invalid key)", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "quota-exceeded-key",
      },
    });

    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.status, "error");
    assert.strictEqual(res.body.error, "QUOTA_EXCEEDED");
    assert.ok(res.body.detail.includes("quota"));
  });

  test("12. Activation with custom prefix and length succeeds with 200 OK and creates session", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "custom_prefix_key_without_aizasy",
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, "success");
    assert.ok(res.cookies[SESSION_COOKIE_NAME]);
  });

  test("13. Activation with accidental leading and trailing whitespace safely trims and activates", async () => {
    const res = await dispatch({
      method: "POST",
      url: "/api/v1/session/activate",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: {
        apiKey: "   AIzaSyTestValidKey1234567890abcdefghijklmnopqrst   ",
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, "success");
    assert.ok(res.cookies[SESSION_COOKIE_NAME]);
  });
});
