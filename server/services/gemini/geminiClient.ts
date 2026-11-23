import { GeminiProvider } from "../ai/providers/geminiProvider";

export interface KeyVerificationResult {
  valid: boolean;
  model: string;
  testedAt: string;
}

export class GeminiClientFactory {
  private static provider = new GeminiProvider();

  public static validateKeyFormat(apiKey: unknown): string {
    return this.provider.validateKeyFormat(apiKey);
  }

  public static createClient(apiKey: string) {
    return this.provider.createClient(apiKey);
  }

  public static async verifyKey(apiKey: string): Promise<KeyVerificationResult> {
    const res = await this.provider.verifyApiKey(apiKey);
    return {
      valid: res.valid,
      model: res.model,
      testedAt: res.testedAt,
    };
  }
}
