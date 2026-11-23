import { Router, Request, Response } from "express";
import { sessionStore, SESSION_COOKIE_NAME } from "../services/sessionStore";
import { requireSession } from "../middleware/sessionMiddleware";
import { ApiKeyEncryptionService } from "../services/apiKeyEncryptionService";
import { AIService } from "../services/ai/aiService";
import { RateLimiterService } from "../services/rateLimiterService";
import {
  AIError,
  InvalidApiKeyError,
  MalformedApiKeyError,
  ApiPermissionDeniedError,
  QuotaExceededError,
  ModelUnavailableError,
  ModelIncompatibleError,
  ProviderNetworkError,
  ProviderTimeoutError,
  ProviderServiceError,
  ProviderUnavailableError,
} from "../services/ai/aiErrors";
import { GeminiProvider } from "../services/ai/providers/geminiProvider";
import { SessionModelCache } from "../services/ai/modelCache";
import { AIDiagnosticsService } from "../services/ai/aiDiagnostics";
import { config } from "../config";

export const sessionRouter = Router();

const encryptionService = new ApiKeyEncryptionService();

export function setSessionCookie(req: Request, res: Response, sessionId: string, ttlSeconds: number) {
  // Cookies on localhost / 127.0.0.1 must not be marked Secure=true over plain HTTP,
  // otherwise browsers will drop them immediately.
  const host = (req.headers.host || "").toLowerCase();
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const useSecure = config.nodeEnv === "production" && !isLocalhost && isHttps;

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: useSecure,
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  const host = (req.headers.host || "").toLowerCase();
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const useSecure = config.nodeEnv === "production" && !isLocalhost && isHttps;

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: useSecure,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * POST /api/v1/session/activate
 * PUBLIC ENDPOINT: Does not require an existing session or cookie.
 * Validates Gemini API key, creates anonymous session, encrypts key, sets HttpOnly cookie.
 */
sessionRouter.post("/activate", async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const ipCheck = RateLimiterService.checkIpLimit(clientIp, 30, 5 * 60 * 1000);
  if (!ipCheck.allowed) {
    res.status(429).json({
      error: "RATE_LIMITED",
      detail: `Too many activation attempts. Please wait ${ipCheck.retryAfterSeconds} seconds.`,
    });
    return;
  }

  const rawKey = req.body?.apiKey;

  try {
    // 1. Validate key format
    const geminiProvider = new GeminiProvider();
    const validatedKey = geminiProvider.validateKeyFormat(rawKey);

    // 2. Verify key live with configured AI provider
    const verification = await AIService.verifyApiKey(validatedKey);

    // 3. Encrypt verified key with AES-256-GCM
    const encrypted = encryptionService.encrypt(validatedKey);

    // 4. Create anonymous in-memory session with TTL
    const session = await sessionStore.createSession(
      encrypted.serialized,
      config.sessionKeyTtlSeconds
    );

    // 5. Select compatible model and pre-seed SessionModelCache for instant subsequent analysis
    const selectedModel = await AIService.getProvider().selectCompatibleModel(
      validatedKey,
      config.aiModel,
      session.sessionId
    );
    SessionModelCache.set(session.sessionId, selectedModel);

    // 6. Set HttpOnly, SameSite cookie
    setSessionCookie(req, res, session.sessionId, session.ttlSeconds);

    // 7. Respond with safe metadata (never the key!)
    res.json({
      status: "success",
      message: "LinkScope session activated successfully.",
      sessionId: session.sessionId, // Provided for headless clients / testing
      expiresAt: session.expiresAt.toISOString(),
      ttlSeconds: session.ttlSeconds,
      modelTested: selectedModel,
      provider: verification.provider,
    });
  } catch (err) {
    if (err instanceof MalformedApiKeyError) {
      res.status(400).json({
        status: "error",
        error: "MALFORMED_API_KEY",
        detail: err.message,
      });
      return;
    }

    if (err instanceof InvalidApiKeyError) {
      res.status(400).json({
        status: "error",
        error: "INVALID_API_KEY",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ApiPermissionDeniedError) {
      res.status(403).json({
        status: "error",
        error: "API_PERMISSION_DENIED",
        detail: err.message,
      });
      return;
    }

    if (err instanceof QuotaExceededError) {
      res.status(429).json({
        status: "error",
        error: "QUOTA_EXCEEDED",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ModelUnavailableError) {
      res.status(err.statusCode || 404).json({
        status: "error",
        error: "MODEL_UNAVAILABLE",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ModelIncompatibleError) {
      res.status(400).json({
        status: "error",
        error: "MODEL_INCOMPATIBLE",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ProviderNetworkError) {
      res.status(503).json({
        status: "error",
        error: "PROVIDER_NETWORK_ERROR",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ProviderTimeoutError) {
      res.status(504).json({
        status: "error",
        error: "PROVIDER_TIMEOUT",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ProviderServiceError) {
      res.status(502).json({
        status: "error",
        error: "PROVIDER_SERVICE_ERROR",
        detail: err.message,
      });
      return;
    }

    if (err instanceof ProviderUnavailableError) {
      res.status(503).json({
        status: "error",
        error: "PROVIDER_UNAVAILABLE",
        detail: err.message,
      });
      return;
    }

    const statusCode = err instanceof AIError ? err.statusCode : 502;
    const errorCode = err instanceof AIError ? err.code : "PROVIDER_SERVICE_ERROR";

    res.status(statusCode).json({
      status: "error",
      error: errorCode,
      detail: err instanceof Error ? err.message : "Failed to activate API key.",
    });
  }
});

/**
 * GET /api/v1/session/status
 * PROTECTED: Requires an active session. Returns 401 if missing or invalid.
 */
sessionRouter.get("/status", requireSession, async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.sessionData!.id;
  const status = await sessionStore.getStatus(sessionId);
  res.json(status);
});

/**
 * GET /api/v1/session/diagnostics
 * PROTECTED: Tests upstream Google Gemini connectivity, model discovery, and compatibility.
 * By default, skips billable structured generation unless ?runGeneration=true is passed.
 * Never outputs the API key or sensitive headers.
 */
sessionRouter.get("/diagnostics", requireSession, async (req: Request, res: Response): Promise<void> => {
  const encryptedKey = req.sessionData!.encryptedKey;
  const runGeneration = req.query.runGeneration === "true";
  let decryptedKey: string | null = null;
  try {
    decryptedKey = encryptionService.decrypt(encryptedKey);
    const report = await AIDiagnosticsService.runDiagnostics(decryptedKey, { runGeneration });
    res.json(report);
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: "DIAGNOSTICS_FAILED",
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    decryptedKey = null;
  }
});

/**
 * POST /api/v1/session/diagnostics
 * Strictly rate-limited diagnostic probe endpoint.
 * Accepts an apiKey in request body (or active session) without persisting it.
 * By default runs non-billable steps (A, B, C); runs Step D only if runGeneration: true.
 * NEVER logs or persists the key.
 */
sessionRouter.post("/diagnostics", async (req: Request, res: Response): Promise<void> => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const ipCheck = RateLimiterService.checkIpLimit(clientIp, 10, 15 * 60 * 1000); // 10 per 15 min
  if (!ipCheck.allowed) {
    res.status(429).json({
      status: "error",
      error: "RATE_LIMITED",
      detail: `Too many diagnostic attempts. Please wait ${ipCheck.retryAfterSeconds} seconds.`,
    });
    return;
  }

  // Request body validation & size limits
  if (req.body && typeof req.body !== "object") {
    res.status(400).json({
      status: "error",
      error: "INVALID_REQUEST",
      detail: "Request body must be a JSON object.",
    });
    return;
  }

  const runGeneration = req.body?.runGeneration === true;
  let keyToTest: string | null = null;

  if (typeof req.body?.apiKey === "string" && req.body.apiKey.trim()) {
    try {
      const provider = new GeminiProvider();
      keyToTest = provider.validateKeyFormat(req.body.apiKey);
    } catch (err) {
      res.status(400).json({
        status: "error",
        error: "MALFORMED_API_KEY",
        detail: err instanceof Error ? err.message : "Invalid key format",
      });
      return;
    }
  } else {
    // Check if session cookie exists
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionId) {
      const session = await sessionStore.getSession(sessionId);
      if (session) {
        keyToTest = encryptionService.decrypt(session.encryptedKey);
      }
    }
  }

  if (!keyToTest) {
    res.status(400).json({
      status: "error",
      error: "MISSING_KEY",
      detail: "Please provide an apiKey in request body or possess an active session cookie.",
    });
    return;
  }

  try {
    const report = await AIDiagnosticsService.runDiagnostics(keyToTest, { runGeneration });
    res.json(report);
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: "DIAGNOSTICS_FAILED",
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    keyToTest = null;
  }
});

/**
 * POST /api/v1/session/logout
 * PROTECTED: Destroys the server-side session, deletes the encrypted key, and clears the cookie.
 */
sessionRouter.post("/logout", requireSession, async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.sessionData!.id;
  SessionModelCache.invalidate(sessionId);
  await sessionStore.deleteSession(sessionId);
  clearSessionCookie(req, res);

  res.json({
    status: "success",
    message: "Session ended successfully.",
  });
});
