import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ApiKeyEncryptionService } from "../server/services/apiKeyEncryptionService";
import { validateEncryptionKey } from "../server/config";

describe("ApiKeyEncryptionService - AES-256-GCM Encryption Tests", () => {
  const validHexKey = crypto.randomBytes(32).toString("hex");
  const encryptionService = new ApiKeyEncryptionService(validHexKey);

  test("successfully encrypts and decrypts a Gemini API key", () => {
    const rawApiKey = "AIzaSyTestApiKey1234567890abcdefghijklmnopqrst";
    const encrypted = encryptionService.encrypt(rawApiKey);

    assert.ok(encrypted.serialized.startsWith("v1:"));
    assert.strictEqual(typeof encrypted.ivHex, "string");
    assert.strictEqual(typeof encrypted.authTagHex, "string");
    assert.strictEqual(typeof encrypted.ciphertextHex, "string");

    const decrypted = encryptionService.decrypt(encrypted.serialized);
    assert.strictEqual(decrypted, rawApiKey);
  });

  test("produces different ciphertexts and unique nonces for identical plaintexts", () => {
    const rawApiKey = "AIzaSySameKeyRepeatedEncryption1234567890";
    const enc1 = encryptionService.encrypt(rawApiKey);
    const enc2 = encryptionService.encrypt(rawApiKey);

    // Nonces must be unique
    assert.notStrictEqual(enc1.ivHex, enc2.ivHex);
    // Ciphertexts must differ
    assert.notStrictEqual(enc1.ciphertextHex, enc2.ciphertextHex);

    // Both decrypt back to the exact same plaintext
    assert.strictEqual(encryptionService.decrypt(enc1.serialized), rawApiKey);
    assert.strictEqual(encryptionService.decrypt(enc2.serialized), rawApiKey);
  });

  test("rejects tampered ciphertext with an authentication error", () => {
    const rawApiKey = "AIzaSyTamperTest1234567890";
    const enc = encryptionService.encrypt(rawApiKey);

    // Tamper with the last character of the ciphertext
    const tamperedCipher = enc.ciphertextHex.slice(0, -2) + (enc.ciphertextHex.endsWith("00") ? "11" : "00");
    const tamperedSerialized = `v1:${enc.ivHex}:${enc.authTagHex}:${tamperedCipher}`;

    assert.throws(
      () => encryptionService.decrypt(tamperedSerialized),
      /Decryption failed: authentication tag verification mismatch/
    );
  });

  test("rejects tampered auth tag with an authentication error", () => {
    const rawApiKey = "AIzaSyAuthTagTamper1234567890";
    const enc = encryptionService.encrypt(rawApiKey);

    // Tamper with the auth tag
    const tamperedTag = "ff" + enc.authTagHex.slice(2);
    const tamperedSerialized = `v1:${enc.ivHex}:${tamperedTag}:${enc.ciphertextHex}`;

    assert.throws(
      () => encryptionService.decrypt(tamperedSerialized),
      /Decryption failed: authentication tag verification mismatch/
    );
  });

  test("rejects unsupported encryption version", () => {
    const invalidVersion = "v99:0102030405060708090a0b0c:0102030405060708090a0b0c0d0e0f10:aabbcc";
    assert.throws(
      () => encryptionService.decrypt(invalidVersion),
      /Unsupported encryption version: 'v99'/
    );
  });

  test("rejects invalid master key length", () => {
    // 16 bytes instead of 32 bytes
    const shortKeyHex = crypto.randomBytes(16).toString("hex");
    assert.throws(
      () => validateEncryptionKey(shortKeyHex),
      /FATAL: GEMINI_ENCRYPTION_KEY is invalid/
    );
  });

  test("fails safely when encryption key is missing", () => {
    assert.throws(
      () => validateEncryptionKey(""),
      /FATAL: GEMINI_ENCRYPTION_KEY environment variable is missing/
    );
  });

  test("maskKey returns masked placeholder without plaintext", () => {
    const mask = ApiKeyEncryptionService.maskKey();
    assert.strictEqual(mask, "••••••••••••••••");
  });
});
