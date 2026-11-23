import { config } from "../../config";

export interface ModelConfig {
  id: string;
  displayName: string;
  description: string;
}

export const DEFAULT_PRIMARY_MODEL = config.aiModel;

export function isModelSupported(modelId: string): boolean {
  return typeof modelId === "string" && modelId.trim().length > 0;
}
