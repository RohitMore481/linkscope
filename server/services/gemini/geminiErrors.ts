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
  InvalidModelResponseError,
  GenerationTimeoutError,
  classifyAIError,
} from "../ai/aiErrors";

export {
  AIError,
  AIError as GeminiError,
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
  InvalidModelResponseError,
  GenerationTimeoutError,
  classifyAIError,
};

export class GeminiServiceError extends ProviderServiceError {
  constructor(message = "Gemini service encountered an upstream error. Please try again.") {
    super(message);
    this.name = "GeminiServiceError";
    (this as any).code = "GEMINI_SERVICE_ERROR";
    (this as any).statusCode = 502;
  }
}

export class GeminiTimeoutError extends ProviderTimeoutError {
  constructor(message = "Gemini request timed out. Please try again.") {
    super(message);
    this.name = "GeminiTimeoutError";
    (this as any).code = "GENERATION_TIMEOUT";
  }
}

export class GeminiNetworkError extends ProviderNetworkError {
  constructor(message = "Unable to reach Gemini. Please check your network and try again.") {
    super(message);
    this.name = "GeminiNetworkError";
  }
}

export function classifyGeminiError(err: unknown, requestedModel?: string): AIError {
  const classified = classifyAIError(err, requestedModel, "Google Gemini");
  if (classified instanceof GenerationTimeoutError || classified instanceof ProviderTimeoutError) {
    return new GeminiTimeoutError(classified.message);
  }
  if (classified instanceof ProviderServiceError) {
    return new GeminiServiceError(classified.message);
  }
  if (classified instanceof ProviderNetworkError) {
    return new GeminiNetworkError(classified.message);
  }
  return classified;
}
