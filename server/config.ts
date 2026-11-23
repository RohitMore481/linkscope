import dotenv from "dotenv";

dotenv.config();

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  encryptionKeyHex: string;
  sessionKeyTtlSeconds: number;
  allowedOrigins: string[];
  aiProvider: string;
  aiModel: string;
  primaryModel: string;
}

export function validateEncryptionKey(rawKey: string | undefined): Buffer {
  if (!rawKey || !rawKey.trim()) {
    throw new Error(
      "FATAL: GEMINI_ENCRYPTION_KEY environment variable is missing. " +
      "LinkScope requires a 32-byte secret for AES-256-GCM encryption of in-memory session credentials. " +
      "Generate one using: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  const trimmed = rawKey.trim();
  let buffer: Buffer;

  // Try hex decoding (64 hex characters)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    buffer = Buffer.from(trimmed, "hex");
  } else {
    // Try base64 decoding (44 characters)
    buffer = Buffer.from(trimmed, "base64");
  }

  if (buffer.length !== 32) {
    throw new Error(
      `FATAL: GEMINI_ENCRYPTION_KEY is invalid. Expected exactly 32 bytes (64 hex characters), but got ${buffer.length} bytes. ` +
      "Generate one using: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  return buffer;
}

export function loadConfig(): ServerConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const port = Number(process.env.PORT || 4000);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`FATAL: Invalid PORT environment variable: ${process.env.PORT}`);
  }
  const encryptionKeyRaw = process.env.GEMINI_ENCRYPTION_KEY;

  let encryptionKeyHex = "";
  if (nodeEnv === "production") {
    // In production, encryption key is strictly mandatory
    validateEncryptionKey(encryptionKeyRaw);
    encryptionKeyHex = encryptionKeyRaw!.trim();
  } else if (nodeEnv !== "test") {
    if (encryptionKeyRaw) {
      validateEncryptionKey(encryptionKeyRaw);
      encryptionKeyHex = encryptionKeyRaw.trim();
    } else {
      console.warn(
        "[LinkScope Config] Warning: GEMINI_ENCRYPTION_KEY is not set. In-memory session key encryption will require this key."
      );
    }
  } else {
    encryptionKeyHex = encryptionKeyRaw || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }

  const sessionTtlRaw = process.env.SESSION_KEY_TTL_SECONDS;
  const sessionKeyTtlSeconds = sessionTtlRaw ? Math.max(60, Number(sessionTtlRaw)) : 86400; // Default 24 hours

  // Default allowed origins for development & production
  const defaultOrigins = [
    "http://localhost:4000",
    "http://localhost:3000",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:3000",
    "localhost:4000",
    "localhost:3000",
    "127.0.0.1:4000",
    "127.0.0.1:3000",
  ];

  const rawOrigins = process.env.ALLOWED_ORIGINS || "";
  const envOrigins = rawOrigins
    ? rawOrigins.split(",").map((o) => o.trim().toLowerCase())
    : [];

  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

  const aiProvider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const aiModel = process.env.AI_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

  return {
    port,
    nodeEnv,
    encryptionKeyHex,
    sessionKeyTtlSeconds,
    allowedOrigins,
    aiProvider,
    aiModel,
    primaryModel: aiModel,
  };
}

export const config = loadConfig();
