import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGeminiError,
  InvalidApiKeyError,
  QuotaExceededError,
  GeminiTimeoutError,
  ModelUnavailableError,
  GeminiServiceError,
} from "../server/services/gemini/geminiErrors";
import { ANALYSIS_RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "../server/services/gemini/geminiService";

describe("Gemini Service & Error Classification Tests", () => {
  test("SYSTEM_INSTRUCTION contains required analytical directives", () => {
    assert.ok(SYSTEM_INSTRUCTION.includes("senior digital strategy"));
    assert.ok(SYSTEM_INSTRUCTION.includes("EXACTLY 5 items"));
    assert.ok(SYSTEM_INSTRUCTION.includes("Do NOT invent numeric metrics"));
  });

  test("ANALYSIS_RESPONSE_SCHEMA specifies all required 5 sections", () => {
    const required = ANALYSIS_RESPONSE_SCHEMA.required;
    assert.ok(required.includes("competitor_vs_your_brand"));
    assert.ok(required.includes("top_5_target_search_queries"));
    assert.ok(required.includes("seo_improvement"));
    assert.ok(required.includes("top_5_services"));
    assert.ok(required.includes("target_audience_identification"));
  });

  test("classifies 401 unauthenticated errors into InvalidApiKeyError with user-friendly message", () => {
    const err = new Error("Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. [401]");
    const classified = classifyGeminiError(err);
    assert.ok(classified instanceof InvalidApiKeyError);
    assert.strictEqual(
      classified.message,
      "Your Gemini API key is invalid. Please verify your key in Google AI Studio."
    );
  });

  test("classifies 429 quota exhaustion into QuotaExceededError with user-friendly message", () => {
    const err = new Error("Resource has been exhausted (e.g. check quota). [429]");
    const classified = classifyGeminiError(err);
    assert.ok(classified instanceof QuotaExceededError);
    assert.strictEqual(
      classified.message,
      "Your Gemini API quota has been exceeded. Check your Google AI Studio usage and billing settings."
    );
  });

  test("classifies model not found errors into ModelUnavailableError", () => {
    const err = new Error("models/gemini-custom-model is not found for API version v1beta");
    const classified = classifyGeminiError(err, "gemini-custom-model");
    assert.ok(classified instanceof ModelUnavailableError);
    assert.strictEqual(
      classified.message,
      "The selected Gemini model 'gemini-custom-model' is unavailable for your API key."
    );
  });

  test("classifies timeout errors into GeminiTimeoutError", () => {
    const err = new Error("The operation timed out after 30000ms");
    const classified = classifyGeminiError(err);
    assert.ok(classified instanceof GeminiTimeoutError);
    assert.strictEqual(classified.retryable, true);
  });

  test("quota errors are not classified as invalid keys", () => {
    const err = new Error("RESOURCE_EXHAUSTED: Rate limit exceeded");
    const classified = classifyGeminiError(err);
    assert.ok(classified instanceof QuotaExceededError);
    assert.ok(!(classified instanceof InvalidApiKeyError));
    assert.strictEqual(classified.code, "QUOTA_EXCEEDED");
    assert.strictEqual(classified.statusCode, 429);
  });

  test("classifies unknown upstream failures into GeminiServiceError", () => {
    const err = new Error("Internal upstream gateway error from Google servers");
    const classified = classifyGeminiError(err);
    assert.ok(classified instanceof GeminiServiceError);
    assert.strictEqual(classified.code, "GEMINI_SERVICE_ERROR");
    assert.strictEqual(classified.statusCode, 502);
  });
});
