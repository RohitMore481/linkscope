import type {
  AIProvider,
  ModelCapability,
  StructuredAnalysisOptions,
  StructuredAnalysisOutput,
  VerificationResult,
} from "./types";
import { ProviderUnavailableError } from "./aiErrors";
import { GeminiProvider } from "./providers/geminiProvider";
import { config } from "../../config";

export class AIService {
  private static providers: Map<string, AIProvider> = new Map();

  static {
    // Register default providers
    const gemini = new GeminiProvider();
    this.registerProvider(gemini);
  }

  /**
   * Registers a new AIProvider implementation in the registry.
   */
  public static registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  /**
   * Retrieves an AIProvider by ID, defaulting to the configured AI_PROVIDER.
   */
  public static getProvider(providerId?: string): AIProvider {
    const id = (providerId || config.aiProvider || "gemini").toLowerCase();
    const provider = this.providers.get(id);

    if (!provider) {
      throw new ProviderUnavailableError(
        `AI Provider '${id}' is not registered or supported. Configured providers: ${Array.from(this.providers.keys()).join(", ")}.`
      );
    }

    return provider;
  }

  /**
   * Verifies an API key against the specified or configured provider.
   */
  public static async verifyApiKey(
    apiKey: string,
    providerId?: string
  ): Promise<VerificationResult> {
    const provider = this.getProvider(providerId);
    return provider.verifyApiKey(apiKey);
  }

  /**
   * Discovers available models for a given provider and API key.
   */
  public static async discoverModels(
    apiKey: string,
    providerId?: string
  ): Promise<ModelCapability[]> {
    const provider = this.getProvider(providerId);
    return provider.discoverModels(apiKey);
  }

  /**
   * Executes structured website intelligence analysis through the active AI provider.
   */
  public static async analyzeWebsite(
    apiKey: string,
    promptText: string,
    options?: StructuredAnalysisOptions,
    providerId?: string
  ): Promise<StructuredAnalysisOutput> {
    const provider = this.getProvider(providerId);
    return provider.generateAnalysis(apiKey, promptText, options);
  }
}
