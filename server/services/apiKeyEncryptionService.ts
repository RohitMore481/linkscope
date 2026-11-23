import crypto from "node:crypto";
import { validateEncryptionKey } from "../config";

export interface EncryptedPayload {
  version: string;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  serialized: string;
}

export class ApiKeyEncryptionService {
  private masterKey: Buffer;
  public static readonly CURRENT_VERSION = "v1";
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH_BYTES = 12; // 96-bit IV recommended for GCM
  private static readonly AUTH_TAG_LENGTH_BYTES = 16; // 128-bit auth tag

  constructor(masterKeyInput?: string | Buffer) {
    if (masterKeyInput) {
      if (typeof masterKeyInput === "string") {
        this.masterKey = validateEncryptionKey(masterKeyInput);
      } else if (Buffer.isBuffer(masterKeyInput)) {
        if (masterKeyInput.length !== 32) {
          throw new Error(`Master encryption key buffer must be 32 bytes, got ${masterKeyInput.length}`);
        }
        this.masterKey = masterKeyInput;
      } else {
        throw new Error("Invalid master key format");
      }
    } else {
      const envKey = process.env.GEMINI_ENCRYPTION_KEY;
      this.masterKey = validateEncryptionKey(envKey);
    }
  }

  /**
   * Encrypts a plaintext API key using AES-256-GCM with a unique cryptographically secure 96-bit IV.
   * Produces an authenticated ciphertext and tag.
   */
  public encrypt(plaintext: string): EncryptedPayload {
    if (!plaintext || typeof plaintext !== "string" || !plaintext.trim()) {
      throw new Error("Cannot encrypt empty or invalid API key");
    }

    const trimmed = plaintext.trim();
    const iv = crypto.randomBytes(ApiKeyEncryptionService.IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ApiKeyEncryptionService.ALGORITHM, this.masterKey, iv);

    const ciphertext = Buffer.concat([
      cipher.update(trimmed, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    const ivHex = iv.toString("hex");
    const authTagHex = authTag.toString("hex");
    const ciphertextHex = ciphertext.toString("hex");
    const serialized = `${ApiKeyEncryptionService.CURRENT_VERSION}:${ivHex}:${authTagHex}:${ciphertextHex}`;

    return {
      version: ApiKeyEncryptionService.CURRENT_VERSION,
      ivHex,
      authTagHex,
      ciphertextHex,
      serialized,
    };
  }

  /**
   * Decrypts a serialized encrypted string (`v1:<iv>:<authTag>:<ciphertext>`)
   * Verifies the authentication tag and returns the plaintext key.
   */
  public decrypt(serialized: string): string {
    if (!serialized || typeof serialized !== "string") {
      throw new Error("Invalid encrypted payload string");
    }

    const parts = serialized.split(":");
    if (parts.length !== 4) {
      throw new Error(
        `Malformed encrypted payload format. Expected 4 segments separated by colon, got ${parts.length}`
      );
    }

    const [version, ivHex, authTagHex, ciphertextHex] = parts;

    if (version !== ApiKeyEncryptionService.CURRENT_VERSION) {
      throw new Error(`Unsupported encryption version: '${version}'. Supported: '${ApiKeyEncryptionService.CURRENT_VERSION}'`);
    }

    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error("Incomplete encrypted payload components");
    }

    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== ApiKeyEncryptionService.IV_LENGTH_BYTES) {
      throw new Error(`Invalid IV length: expected ${ApiKeyEncryptionService.IV_LENGTH_BYTES} bytes, got ${iv.length}`);
    }

    const authTag = Buffer.from(authTagHex, "hex");
    if (authTag.length !== ApiKeyEncryptionService.AUTH_TAG_LENGTH_BYTES) {
      throw new Error(`Invalid auth tag length: expected ${ApiKeyEncryptionService.AUTH_TAG_LENGTH_BYTES} bytes, got ${authTag.length}`);
    }

    const ciphertext = Buffer.from(ciphertextHex, "hex");
    if (ciphertext.length === 0) {
      throw new Error("Ciphertext cannot be empty");
    }

    const decipher = crypto.createDecipheriv(ApiKeyEncryptionService.ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (err) {
      throw new Error(
        "Decryption failed: authentication tag verification mismatch or corrupted ciphertext. " +
        (err instanceof Error ? err.message : "")
      );
    }
  }

  /**
   * Returns a safely masked preview of the key (e.g. ••••••••••••••••).
   * Plaintext keys are never returned or reconstructed.
   */
  public static maskKey(): string {
    return "••••••••••••••••";
  }
}
