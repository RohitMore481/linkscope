import { GeminiProvider, normalizeModelId } from "./providers/geminiProvider";
import {
  AIError,
  classifyAIError,
  InvalidModelResponseError,
} from "./aiErrors";
import type { ModelCapability, ModelEvaluationReport } from "./types";
import { config } from "../../config";

export interface DiagnosticStep {
  step: "A" | "B" | "C" | "D";
  name: string;
  passed: boolean;
  durationMs: number;
  skipped?: boolean;
  details?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    statusCode: number;
    safeDetails?: Record<string, unknown>;
  };
}

export interface DiagnosticsOptions {
  runGeneration?: boolean; // Default false to avoid accidental billable requests during basic health checks
}

export interface DiagnosticsReport {
  timestamp: string;
  provider: string;
  overallPassed: boolean;
  failingStep?: "A" | "B" | "C" | "D";
  steps: {
    stepA_keyVerification: DiagnosticStep;
    stepB_modelDiscovery: DiagnosticStep;
    stepC_compatibilityCheck: DiagnosticStep;
    stepD_structuredGeneration: DiagnosticStep;
  };
}

export class AIDiagnosticsService {
  private static provider = new GeminiProvider();

  /**
   * Step A: Gemini API key verification.
   * Probes key validity against upstream Gemini API without generating content.
   */
  public static async testStepA_KeyVerification(apiKey: string): Promise<DiagnosticStep> {
    const start = Date.now();
    try {
      const res = await this.provider.verifyApiKey(apiKey);
      return {
        step: "A",
        name: "Gemini API Key Verification",
        passed: true,
        durationMs: Date.now() - start,
        details: {
          provider: res.provider,
          model: res.model,
          verified: res.valid,
        },
      };
    } catch (err) {
      const classified = classifyAIError(err, undefined, "Google Gemini");
      return {
        step: "A",
        name: "Gemini API Key Verification",
        passed: false,
        durationMs: Date.now() - start,
        error: {
          code: classified.code,
          message: classified.message,
          statusCode: classified.statusCode,
          safeDetails: classified.diagnosticDetails,
        },
      };
    }
  }

  /**
   * Step B: Configured Model Availability check.
   * Verifies that the configured model is active, non-deprecated, and accessible.
   */
  public static async testStepB_ModelDiscovery(
    apiKey: string
  ): Promise<{ step: DiagnosticStep; models?: ModelCapability[] }> {
    const start = Date.now();
    const targetModel = normalizeModelId(config.aiModel).cleanId;
    try {
      const compat = await this.provider.checkModelCompatibility(apiKey, targetModel);
      if (!compat.compatible || compat.isDeprecated) {
        return {
          step: {
            step: "B",
            name: `Model Availability (${targetModel})`,
            passed: false,
            durationMs: Date.now() - start,
            error: {
              code: compat.isDeprecated ? "MODEL_DEPRECATED" : "MODEL_UNAVAILABLE",
              message: compat.reason || `Configured model '${targetModel}' is not available or is deprecated.`,
              statusCode: 404,
            },
          },
        };
      }

      return {
        step: {
          step: "B",
          name: `Model Availability (${targetModel})`,
          passed: true,
          durationMs: Date.now() - start,
          details: {
            configuredModel: targetModel,
            available: true,
            isDeprecated: false,
          },
        },
      };
    } catch (err) {
      const classified = classifyAIError(err, targetModel, "Google Gemini");
      return {
        step: {
          step: "B",
          name: `Model Availability (${targetModel})`,
          passed: false,
          durationMs: Date.now() - start,
          error: {
            code: classified.code,
            message: classified.message,
            statusCode: classified.statusCode,
            safeDetails: classified.diagnosticDetails,
          },
        },
      };
    }
  }

  /**
   * Step C: Structured-Output Compatibility check for configured model.
   * Verifies canonical schema support against the configured model.
   */
  public static async testStepC_CompatibilityCheck(
    apiKey: string,
    discoveredModels?: ModelCapability[]
  ): Promise<{ step: DiagnosticStep; selectedModel?: string; evaluationReport?: ModelEvaluationReport }> {
    const start = Date.now();
    const targetModel = normalizeModelId(config.aiModel).cleanId;
    try {
      const evaluationReport = await this.provider.evaluateModels(apiKey);
      const compat = await this.provider.checkModelCompatibility(apiKey, targetModel);

      return {
        step: {
          step: "C",
          name: `Structured-Output Compatibility (${targetModel})`,
          passed: compat.supportsStructuredOutputs,
          durationMs: Date.now() - start,
          details: {
            selectedModel: targetModel,
            supportsStructuredOutputs: compat.supportsStructuredOutputs,
            isDeprecated: compat.isDeprecated,
            evaluationReport,
          },
        },
        selectedModel: targetModel,
        evaluationReport,
      };
    } catch (err) {
      const classified = classifyAIError(err, targetModel, "Google Gemini");
      return {
        step: {
          step: "C",
          name: `Structured-Output Compatibility (${targetModel})`,
          passed: false,
          durationMs: Date.now() - start,
          error: {
            code: classified.code,
            message: classified.message,
            statusCode: classified.statusCode,
            safeDetails: classified.diagnosticDetails,
          },
        },
      };
    }
  }

  /**
   * Evaluates all discovered models and returns a sanitized model evaluation report.
   */
  public static async evaluateModels(apiKey: string): Promise<ModelEvaluationReport> {
    return this.provider.evaluateModels(apiKey);
  }

  /**
   * Step D: Actual structured content generation.
   * Tests generating a minimal 5-section intelligence payload with the configured model.
   * Explicitly separated from low-cost health checks.
   */
  public static async testStepD_StructuredGeneration(
    apiKey: string,
    selectedModel = config.aiModel
  ): Promise<DiagnosticStep> {
    const start = Date.now();
    const targetModel = normalizeModelId(selectedModel).cleanId;
    try {
      const prompt = "LinkScope diagnostic probe: analyze this test page and extract competitive, query, and SEO signals.";
      const res = await this.provider.generateAnalysis(apiKey, prompt, {
        model: targetModel,
        timeoutMs: 25000,
      });

      // Verify all 5 canonical sections exist
      if (
        !res.analysis.competitor_vs_your_brand ||
        !res.analysis.top_5_target_search_queries ||
        !res.analysis.seo_improvement ||
        !res.analysis.top_5_services ||
        !res.analysis.target_audience_identification
      ) {
        throw new InvalidModelResponseError("Diagnostic analysis output missing one or more required sections.");
      }

      return {
        step: "D",
        name: `Actual Analysis Generation (${targetModel})`,
        passed: true,
        durationMs: Date.now() - start,
        details: {
          modelUsed: res.modelUsed,
          provider: res.provider,
          sectionsVerified: 5,
        },
      };
    } catch (err) {
      const classified = classifyAIError(err, targetModel, "Google Gemini");
      return {
        step: "D",
        name: `Actual Analysis Generation (${targetModel})`,
        passed: false,
        durationMs: Date.now() - start,
        error: {
          code: classified.code,
          message: classified.message,
          statusCode: classified.statusCode,
          safeDetails: classified.diagnosticDetails,
        },
      };
    }
  }

  /**
   * Executes the full isolated diagnostic procedure using the user's session key.
   * If options.runGeneration is true, executes Step D. Otherwise skips Step D to avoid billable requests.
   */
  public static async runDiagnostics(
    apiKey: string,
    options?: DiagnosticsOptions
  ): Promise<DiagnosticsReport> {
    const runGeneration = options?.runGeneration === true;

    // Step A
    const stepA = await this.testStepA_KeyVerification(apiKey);

    // Step B
    const stepBResult = await this.testStepB_ModelDiscovery(apiKey);
    const stepB = stepBResult.step;

    // Step C
    const stepCResult = await this.testStepC_CompatibilityCheck(apiKey, stepBResult.models);
    const stepC = stepCResult.step;

    // Step D: Only run if explicitly requested and prerequisites passed
    let stepD: DiagnosticStep;
    if (!runGeneration) {
      stepD = {
        step: "D",
        name: "Structured Content Generation",
        passed: true,
        skipped: true,
        durationMs: 0,
        details: {
          skipped: true,
          reason: "Separated from non-billable discovery checks. Set runGeneration: true to execute live structured generation test.",
        },
      };
    } else if (stepA.passed && stepC.passed) {
      const modelToUse = stepCResult.selectedModel || config.aiModel;
      stepD = await this.testStepD_StructuredGeneration(apiKey, modelToUse);
    } else {
      stepD = {
        step: "D",
        name: "Structured Content Generation",
        passed: false,
        durationMs: 0,
        error: {
          code: "PREREQUISITE_FAILED",
          message: "Skipped structured generation because prerequisite Step A or Step C failed.",
          statusCode: 400,
        },
      };
    }

    const overallPassed = stepA.passed && stepB.passed && stepC.passed && stepD.passed;
    let failingStep: "A" | "B" | "C" | "D" | undefined;
    if (!stepA.passed) failingStep = "A";
    else if (!stepB.passed) failingStep = "B";
    else if (!stepC.passed) failingStep = "C";
    else if (!stepD.passed) failingStep = "D";

    return {
      timestamp: new Date().toISOString(),
      provider: "gemini",
      overallPassed,
      failingStep,
      steps: {
        stepA_keyVerification: stepA,
        stepB_modelDiscovery: stepB,
        stepC_compatibilityCheck: stepC,
        stepD_structuredGeneration: stepD,
      },
    };
  }
}
