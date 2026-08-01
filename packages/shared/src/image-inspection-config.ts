import { resolveModelDefinition, type ModelDefinition, type ModelKey } from "./model-config";

export const DEFAULT_IMAGE_INSPECTION_MODEL_KEY = "openrouter:openai/gpt-5.6-luna" as const;
export const KIMI_IMAGE_INSPECTION_MODEL_KEY = "kimi:kimi-k2.7-code" as const;

export type ImageInspectionModelKey =
  | typeof DEFAULT_IMAGE_INSPECTION_MODEL_KEY
  | typeof KIMI_IMAGE_INSPECTION_MODEL_KEY;

const kimiDefinition = resolveModelDefinition(KIMI_IMAGE_INSPECTION_MODEL_KEY);
if (!kimiDefinition) throw new Error("Kimi K2.7 Code model definition is missing.");

export const IMAGE_INSPECTION_MODEL_LIST: readonly ModelDefinition[] = [
  {
    key: DEFAULT_IMAGE_INSPECTION_MODEL_KEY,
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    source: "curated",
    contextWindow: null,
    maxTokens: null,
    thinkingDefault: true,
    capabilities: {
      input: ["text", "image"],
      toolUse: "unsupported",
      reasoning: true,
      thinkingToggle: true,
      reasoningEfforts: ["low", "medium", "high"],
      reasoningDefaultEffort: "medium",
    },
    catalogUpdatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    ...kimiDefinition,
    key: KIMI_IMAGE_INSPECTION_MODEL_KEY,
    label: "Kimi K2.7 Code",
  },
];

export const IMAGE_INSPECTION_MODEL_REGISTRY: Readonly<Partial<Record<ModelKey, ModelDefinition>>> =
  Object.fromEntries(IMAGE_INSPECTION_MODEL_LIST.map((definition) => [definition.key, definition]));

export function isImageInspectionModelKey(value: unknown): value is ImageInspectionModelKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(IMAGE_INSPECTION_MODEL_REGISTRY, value);
}

export function resolveImageInspectionModel(value: unknown): ModelDefinition {
  return IMAGE_INSPECTION_MODEL_REGISTRY[
    isImageInspectionModelKey(value) ? value : DEFAULT_IMAGE_INSPECTION_MODEL_KEY
  ]!;
}
