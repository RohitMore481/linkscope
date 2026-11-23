import { AIService } from "../ai/aiService";
import { SYSTEM_INSTRUCTION, ANALYSIS_RESPONSE_SCHEMA } from "../ai/schema";
import type { StructuredAnalysisOptions } from "../ai/types";

export { SYSTEM_INSTRUCTION, ANALYSIS_RESPONSE_SCHEMA };

export class GeminiAnalysisService {
  public static async analyzeWebsite(
    apiKey: string,
    promptText: string,
    options: StructuredAnalysisOptions = {}
  ): Promise<{ analysis: any; modelUsed: string }> {
    const result = await AIService.analyzeWebsite(apiKey, promptText, options, "gemini");
    return {
      analysis: result.analysis,
      modelUsed: result.modelUsed,
    };
  }
}
