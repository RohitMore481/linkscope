import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";

import { config, validateEncryptionKey } from "./server/config";
import { corsMiddleware, validateCsrf } from "./server/middleware/csrfMiddleware";
import { sessionRouter } from "./server/routes/sessionRoutes";
import { analyzeRouter } from "./server/routes/analyzeRoutes";
import { sessionStore } from "./server/services/sessionStore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Trust proxy for secure reverse proxy deployment (Render, Heroku, AWS ALB, Nginx, Cloudflare)
  app.set("trust proxy", 1);

  // Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (process.env.NODE_ENV === "production" || req.secure) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // Structured, Sanitized Request Logging Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", requestId);

    const startTime = process.hrtime.bigint();
    res.on("finish", () => {
      if (
        process.env.NODE_ENV !== "test" &&
        !req.path.startsWith("/@") &&
        !req.path.startsWith("/src") &&
        !req.path.startsWith("/node_modules")
      ) {
        const endTime = process.hrtime.bigint();
        const durationMs = (Number(endTime - startTime) / 1_000_000).toFixed(2);
        const timestamp = new Date().toISOString();
        console.log(
          `[${timestamp}] [${requestId}] ${req.method} ${req.originalUrl || req.path} ${res.statusCode} ${durationMs}ms`
        );
      }
    });

    next();
  });

  // CORS support for cross-origin/cross-port requests
  app.use(corsMiddleware);

  // Cookie parsing and JSON body limit (64kb)
  app.use(cookieParser());
  app.use(express.json({ limit: "64kb" }));

  // CSRF validation on cookie-authenticated requests
  app.use(validateCsrf);

  // Health check endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      architecture: "anonymous_session_byok",
      session_store: "in_memory",
      ttl_seconds: config.sessionKeyTtlSeconds,
      model: config.aiModel,
    });
  });

  // Mount Session Routes (/api/v1/session/activate, status, logout)
  app.use("/api/v1/session", sessionRouter);

  // Mount Analysis Routes (/api/analyze, /api/v1/analyze, /api/link-analysis)
  app.use("/api", analyzeRouter);

  // Catch-all for unhandled API routes so they return JSON 404 and never fall through to HTML
  app.all("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: "API endpoint does not exist",
    });
  });

  // Global error handler (prevents leaking stack traces in production)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err.status === "number" ? err.status : 500;
    const message =
      process.env.NODE_ENV === "production"
        ? status < 500
          ? err.message
          : "Internal server error"
        : err.message || "Internal server error";

    if (process.env.NODE_ENV !== "test") {
      console.error(`[LinkScope Unhandled Error] ${status} - ${err.message || err}`);
    }

    res.status(status).json({
      error: status === 404 ? "Not Found" : status === 400 ? "Bad Request" : "Internal Server Error",
      message,
    });
  });

  return app;
}

export async function startServer() {
  // Validate encryption key configuration on server startup
  validateEncryptionKey(config.encryptionKeyHex);
  console.log("[LinkScope] AES-256-GCM session encryption initialized successfully.");

  const app = createApp();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Determine static assets directory reliably whether running from source or bundled in dist/
    const candidateDist = path.resolve(__dirname, "dist");
    const distPath = fs.existsSync(path.join(__dirname, "index.html"))
      ? __dirname
      : fs.existsSync(candidateDist)
        ? candidateDist
        : path.resolve(process.cwd(), "dist");

    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`[LinkScope] Running on http://localhost:${config.port} (Anonymous Session BYOK, Model: ${config.aiModel})`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;
  const handleShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[LinkScope] Received ${signal}. Initiating graceful shutdown...`);

    server.close(() => {
      console.log("[LinkScope] Closed HTTP server.");
      sessionStore.clear?.();
      console.log("[LinkScope] In-memory session credentials wiped.");
      process.exit(0);
    });

    // Force exit if graceful shutdown exceeds 10 seconds
    setTimeout(() => {
      console.error("[LinkScope] Graceful shutdown timed out after 10s. Forcing exit.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));

  return server;
}

// Automatically start if executed directly as main entry
const isDirectEntry =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectEntry && process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("[LinkScope] Fatal server startup error:", err);
    process.exit(1);
  });
}