export class AIError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly diagnosticDetails?: Record<string, unknown>;

  constructor(
    message: string,
    code = "AI_ERROR",
    statusCode = 502,
    retryable = false,
    diagnosticDetails?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.diagnosticDetails = diagnosticDetails;
  }
}

export class InvalidApiKeyError extends AIError {
  constructor(message = "Your Gemini API key is invalid. Please verify your key in Google AI Studio.") {
    super(message, "INVALID_API_KEY", 401, false);
    this.name = "InvalidApiKeyError";
  }
}

export class MalformedApiKeyError extends AIError {
  constructor(message = "Invalid API key format.") {
    super(message, "MALFORMED_API_KEY", 400, false);
    this.name = "MalformedApiKeyError";
  }
}

export class ApiPermissionDeniedError extends AIError {
  constructor(
    message = "Gemini API access denied. Ensure your API key has permission and the Generative Language API is enabled in your Google Cloud / AI Studio project."
  ) {
    super(message, "API_PERMISSION_DENIED", 403, false);
    this.name = "ApiPermissionDeniedError";
  }
}

export class QuotaExceededError extends AIError {
  constructor(
    message = "Your Gemini API quota has been exceeded. Check your Google AI Studio usage and billing settings."
  ) {
    super(message, "QUOTA_EXCEEDED", 429, false);
    this.name = "QuotaExceededError";
  }
}

export class ModelUnavailableError extends AIError {
  constructor(modelId: string, detail?: string, diagnosticDetails?: Record<string, unknown>) {
    super(
      detail || `The selected Gemini model '${modelId}' is unavailable for your API key.`,
      "MODEL_UNAVAILABLE",
      404,
      false,
      diagnosticDetails
    );
    this.name = "ModelUnavailableError";
  }
}

export class ModelIncompatibleError extends AIError {
  constructor(modelId: string, reason: string) {
    super(
      `Model '${modelId}' is incompatible with LinkScope: ${reason}.`,
      "MODEL_INCOMPATIBLE",
      400,
      false
    );
    this.name = "ModelIncompatibleError";
  }
}

export class ProviderNetworkError extends AIError {
  constructor(
    message = "Unable to connect to upstream AI provider. Please check your network connection, DNS, or proxy settings."
  ) {
    super(message, "PROVIDER_NETWORK_ERROR", 503, true);
    this.name = "ProviderNetworkError";
  }
}

export class ProviderTimeoutError extends AIError {
  constructor(message = "Request to upstream AI provider timed out. Please try again.") {
    super(message, "PROVIDER_TIMEOUT", 504, true);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderServiceError extends AIError {
  constructor(
    message = "Gemini is temporarily experiencing high demand. Please try again shortly.",
    statusCode = 502,
    diagnosticDetails?: Record<string, unknown>
  ) {
    super(message, "PROVIDER_SERVICE_ERROR", statusCode, true, diagnosticDetails);
    this.name = "ProviderServiceError";
  }
}

export class ProviderUnavailableError extends AIError {
  constructor(message = "The upstream AI provider is currently unreachable or unavailable.") {
    super(message, "PROVIDER_UNAVAILABLE", 503, true);
    this.name = "ProviderUnavailableError";
  }
}

export class InvalidModelResponseError extends AIError {
  constructor(message = "The model produced a malformed or invalid response that does not match the report schema.") {
    super(message, "INVALID_MODEL_RESPONSE", 502, false);
    this.name = "InvalidModelResponseError";
  }
}

export class GenerationTimeoutError extends ProviderTimeoutError {
  constructor(message = "AI analysis generation timed out. Please try again.") {
    super(message);
    this.name = "GenerationTimeoutError";
    (this as any).code = "GENERATION_TIMEOUT";
  }
}

/**
 * Normalizes any provider-specific error into canonical LinkScope AIError instances.
 * Extracts HTTP status, Google RPC JSON error codes, and network error causes.
 * Never logs API keys, cookies, or headers.
 */
export function classifyAIError(err: unknown, modelId?: string, providerId = "Google Gemini"): AIError {
  if (err instanceof AIError) {
    return err;
  }

  // 1. Extract raw error metadata
  const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
  const rawStatus = typeof errObj.status === "number" ? errObj.status : undefined;
  const rawMessage = err instanceof Error ? err.message : String(err);
  const rawName = err instanceof Error ? err.name : String(errObj.name || "");
  const cause = err instanceof Error && err.cause ? (err.cause as Record<string, unknown>) : undefined;
  const causeCode = typeof cause?.code === "string" ? cause.code : "";
  const errCode = typeof errObj.code === "string" ? errObj.code : "";

  // 2. Parse Google RPC JSON error if present in error message string, or extract [4xx]/[5xx]
  let googleRpcCode: number | undefined;
  let googleRpcStatus: string | undefined;
  let googleRpcMessage: string | undefined;
  const googleRpcReasons: string[] = [];

  const bracketStatusMatch = rawMessage.match(/\[(4\d\d|5\d\d)\]/);
  const bracketStatus = bracketStatusMatch ? Number(bracketStatusMatch[1]) : undefined;

  try {
    const jsonMatch = rawMessage.match(/\{[\s\S]*"error"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error) {
        googleRpcCode = parsed.error.code;
        googleRpcStatus = parsed.error.status;
        googleRpcMessage = parsed.error.message;
        if (Array.isArray(parsed.error.details)) {
          for (const d of parsed.error.details) {
            if (d?.reason) googleRpcReasons.push(String(d.reason));
          }
        }
      }
    }
  } catch {
    // Message is not formatted as JSON
  }

  const effectiveStatus = googleRpcCode || rawStatus || bracketStatus;
  const allText = `${rawName} ${rawMessage} ${googleRpcStatus || ""} ${googleRpcMessage || ""} ${googleRpcReasons.join(" ")}`.toLowerCase();

  // Safe server-side diagnostic logging (NEVER logs keys or headers)
  console.error(`[${providerId}] Upstream call failure diagnostic:`, {
    errorName: rawName || "UnknownError",
    httpStatus: effectiveStatus,
    rpcStatus: googleRpcStatus,
    rpcReasons: googleRpcReasons,
    causeCode: causeCode || errCode || undefined,
    modelId: modelId || undefined,
  });

  // 3. DNS Resolution Failure
  if (
    causeCode === "ENOTFOUND" ||
    errCode === "ENOTFOUND" ||
    allText.includes("enotfound") ||
    allText.includes("getaddrinfo")
  ) {
    return new ProviderNetworkError(
      `DNS resolution failed for ${providerId} API host (generativelanguage.googleapis.com). Please verify internet connectivity, DNS configuration, and firewall settings.`
    );
  }

  // 4. Connection Refused / Reset / TLS
  if (
    causeCode === "ECONNREFUSED" ||
    errCode === "ECONNREFUSED" ||
    allText.includes("econnrefused")
  ) {
    return new ProviderNetworkError(
      `Connection refused by ${providerId} API host. Please verify outbound network access and proxy settings.`
    );
  }

  if (
    causeCode === "ECONNRESET" ||
    errCode === "ECONNRESET" ||
    allText.includes("econnreset") ||
    allText.includes("und_err_socket")
  ) {
    return new ProviderNetworkError(
      `Connection reset while communicating with ${providerId}. Please try again.`
    );
  }

  if (allText.includes("cert_") || allText.includes("unable_to_verify_leaf_signature")) {
    return new ProviderNetworkError(
      `TLS/SSL certificate validation failed when connecting to ${providerId}.`
    );
  }

  // 5. Network / Request Timeout
  if (
    rawName === "TimeoutError" ||
    rawName === "AbortError" ||
    causeCode === "ETIMEDOUT" ||
    errCode === "ETIMEDOUT" ||
    allText.includes("timed out") ||
    allText.includes("timeout") ||
    allText.includes("aborted")
  ) {
    return new ProviderTimeoutError(
      `Request to ${providerId} timed out. The upstream service took too long to respond.`
    );
  }

  // 6. Authentication / Invalid API Key (400 API_KEY_INVALID, 401 UNAUTHENTICATED)
  if (
    effectiveStatus === 401 ||
    googleRpcReasons.includes("API_KEY_INVALID") ||
    allText.includes("api_key_invalid") ||
    allText.includes("api key not valid") ||
    allText.includes("invalid api key") ||
    allText.includes("unauthenticated") ||
    allText.includes("invalid authentication") ||
    allText.includes("expected oauth 2") ||
    allText.includes("api_key_expired") ||
    allText.includes("401")
  ) {
    return new InvalidApiKeyError();
  }

  // 7. Permission Denied (403 PERMISSION_DENIED / SERVICE_DISABLED)
  if (
    effectiveStatus === 403 ||
    googleRpcStatus === "PERMISSION_DENIED" ||
    allText.includes("permission_denied") ||
    allText.includes("permission denied") ||
    allText.includes("service_disabled") ||
    allText.includes("generative language api has not been used")
  ) {
    return new ApiPermissionDeniedError(
      googleRpcMessage ||
        `Access denied by ${providerId}. Ensure your API key has permission and the Generative Language API is enabled in your Google Cloud / AI Studio project.`
    );
  }

  // 8. Quota Exceeded / Rate Limited (429 RESOURCE_EXHAUSTED)
  if (
    effectiveStatus === 429 ||
    googleRpcStatus === "RESOURCE_EXHAUSTED" ||
    allText.includes("resource_exhausted") ||
    allText.includes("quota exceeded") ||
    allText.includes("rate limit") ||
    allText.includes("429")
  ) {
    return new QuotaExceededError();
  }

  // 9. Model Unavailable / Not Found (404 NOT_FOUND)
  if (
    effectiveStatus === 404 ||
    googleRpcStatus === "NOT_FOUND" ||
    allText.includes("not found") ||
    allText.includes("model not found") ||
    allText.includes("is not found")
  ) {
    return new ModelUnavailableError(modelId || "specified model");
  }

  // 10. Model Incompatible (does not support structured JSON or generateContent)
  if (
    allText.includes("incompatible") ||
    allText.includes("does not support structured") ||
    allText.includes("does not support generation")
  ) {
    return new ModelIncompatibleError(modelId || "specified model", rawMessage);
  }

  // 11. Malformed Model Response / Parsing Failure
  if (
    allText.includes("unexpected token") ||
    allText.includes("syntaxerror") ||
    allText.includes("schema validation")
  ) {
    return new InvalidModelResponseError(`The model response could not be parsed: ${rawMessage}`);
  }

  // 12. Upstream Server Errors (500, 502, 503, 504)
  if (
    (effectiveStatus && effectiveStatus >= 500) ||
    googleRpcStatus === "UNAVAILABLE" ||
    googleRpcStatus === "INTERNAL" ||
    allText.includes("503") ||
    allText.includes("500") ||
    allText.includes("502") ||
    allText.includes("504") ||
    allText.includes("internal error") ||
    allText.includes("service unavailable") ||
    allText.includes("unavailable")
  ) {
    const isUnavailable = effectiveStatus === 503 || googleRpcStatus === "UNAVAILABLE" || allText.includes("503") || allText.includes("unavailable");
    const safeMsg = isUnavailable
      ? "Gemini is temporarily experiencing high demand. Please try again shortly."
      : `Upstream ${providerId} service returned an error (HTTP ${effectiveStatus || 502}). Please try again shortly.`;

    return new ProviderServiceError(safeMsg, 502, {
      httpStatus: effectiveStatus,
      rpcStatus: googleRpcStatus,
      rpcReasons: googleRpcReasons,
      modelId,
    });
  }

  // 13. Generic fetch failure
  if (allText.includes("fetch failed")) {
    return new ProviderNetworkError(
      `Network request to ${providerId} failed. Please verify internet connectivity.`
    );
  }

  // Default fallback preserving original message safely
  return new ProviderServiceError(
    `Upstream ${providerId} error: ${rawMessage || "Unknown upstream error."}`
  );
}
