import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Handles Cross-Origin Resource Sharing (CORS) for configured allowed origins (e.g. http://localhost:4000).
 * Sets Access-Control-Allow-Credentials: true to allow HttpOnly session cookies across ports.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin) {
    const isAllowed = isOriginAllowed(origin);
    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-session-id");
    }
  }

  // Handle preflight OPTIONS requests immediately
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

/**
 * Helper to test if an origin is permitted
 */
function isOriginAllowed(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const hostWithPort = parsed.host.toLowerCase(); // e.g. "localhost:4000"
    const fullOrigin = `${parsed.protocol}//${hostWithPort}`.toLowerCase(); // e.g. "http://localhost:4000"

    // Always allow localhost & 127.0.0.1 on any port in development/testing
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return true;
    }

    // Check configured allowed origins
    return config.allowedOrigins.some((allowed) => {
      const lower = allowed.toLowerCase();
      return (
        lower === fullOrigin ||
        lower === hostWithPort ||
        lower === parsed.hostname ||
        lower === `http://${hostWithPort}` ||
        lower === `https://${hostWithPort}`
      );
    });
  } catch {
    return false;
  }
}

/**
 * Validates Origin/Referer on mutating requests (POST, DELETE, PUT)
 * to guard against Cross-Site Request Forgery (CSRF).
 */
export function validateCsrf(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  // In test mode or when no Origin/Referer is present (e.g. server-to-server or curl), allow
  if (config.nodeEnv === "test" || (!origin && !referer)) {
    next();
    return;
  }

  const sourceHeader = origin || referer;
  if (!sourceHeader) {
    next();
    return;
  }

  let sourceHost: string;
  try {
    sourceHost = new URL(sourceHeader).host.toLowerCase();
  } catch {
    res.status(403).json({
      error: "CSRF_ERROR",
      detail: "Invalid request origin.",
    });
    return;
  }

  // Same host as Host header
  if (host && sourceHost === host.toLowerCase()) {
    next();
    return;
  }

  // Allowed origin
  if (origin && isOriginAllowed(origin)) {
    next();
    return;
  }

  if (referer && isOriginAllowed(referer)) {
    next();
    return;
  }

  res.status(403).json({
    error: "CSRF_REJECTED",
    detail: `Cross-site request forgery protection rejected request from origin '${sourceHeader}'.`,
  });
}
