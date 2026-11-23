import type { LinkAnalysisData } from "../../../src/types/analysis";

export type LifecycleStatus = "active" | "deprecated" | "discontinued" | "unknown";

export interface ModelCapability {
  id: string; // Clean model ID, e.g. "gemini-3.8-flash"
  rawId: string; // Full resource name, e.g. "models/gemini-3.8-flash"
  displayName: string;
  description: string;
  supportedActions: string[]; // e.g. ["generateContent"]
  supportsStructuredOutputs: boolean;
  isDeprecated: boolean;
  lifecycleStatus?: LifecycleStatus;
  version?: string;
  inputTokenLimit?: number; // Context capacity limit in tokens
  outputTokenLimit?: number;
}

export interface ModelRejectionDiagnostic {
  model: string;
  reason: string;
  httpStatus?: number;
  detail?: string;
}

export interface ModelEvaluationReport {
  discoveredCount: number;
  paginationCount: number;
  generateContentSupportedCount: number;
  deprecatedCount: number;
  unknownLifecycleCount: number;
  structuredOutputVerifiedCount: number;
  missingCapabilityMetadataCount: number;
  failedProbeCount: number;
  rejected: ModelRejectionDiagnostic[];
}

export interface ProbeResult {
  supported: boolean;
  status: "SUPPORTED" | "UNSUPPORTED" | "TEMPORARY_ERROR" | "QUOTA_EXCEEDED" | "PERMISSION_DENIED" | "NOT_FOUND" | "TIMEOUT";
  httpStatus?: number;
  reason?: string;
}

export interface VerificationResult {
  valid: boolean;
  provider: string;
  model: string;
  testedAt: string;
}

export interface StructuredAnalysisOptions {
  model?: string; // Explicit model ID or "auto"
  timeoutMs?: number;
  sessionId?: string; // Active session ID for caching compatible model selections
}

export interface StructuredAnalysisOutput {
  analysis: LinkAnalysisData;
  modelUsed: string;
  provider: string;
  timings?: {
    generationDurationMs: number;
    retryDurationMs: number;
  };
}

export interface ModelCompatibilityResult {
  compatible: boolean;
  reason?: string;
  supportsStructuredOutputs: boolean;
  isDeprecated: boolean;
}

export interface AIProvider {
  readonly id: string; // e.g. "gemini"
  readonly name: string; // e.g. "Google Gemini"

  /**
   * Performs lightweight verification that the API key is active.
   */
  verifyApiKey(apiKey: string): Promise<VerificationResult>;

  /**
   * Discovers available models via the provider's API.
   * Caches results to avoid unnecessary repeated calls.
   */
  discoverModels(apiKey: string): Promise<ModelCapability[]>;

  /**
   * Evaluates whether a specific model supports required capabilities
   * (content generation, structured JSON output) and is not deprecated.
   */
  checkModelCompatibility(apiKey: string, modelId: string): Promise<ModelCompatibilityResult>;

  /**
   * Selects an optimal compatible model based on configuration and discovery.
   * Handles "auto" selection, per-session selection caching, and fallback chains.
   */
  selectCompatibleModel(apiKey: string, requestedModel?: string, sessionId?: string): Promise<string>;

  /**
   * Executes structured website intelligence analysis and returns
   * normalized LinkScope data according to the canonical schema.
   */
  generateAnalysis(
    apiKey: string,
    promptText: string,
    options?: StructuredAnalysisOptions
  ): Promise<StructuredAnalysisOutput>;
}

export interface AIConfig {
  provider: string; // "gemini"
  model: string; // specific model ID
}
