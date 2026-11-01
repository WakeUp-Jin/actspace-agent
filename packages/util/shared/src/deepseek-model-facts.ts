import type { ModelDefinition, ModelPricing } from "./model-config";

/** Official release boundaries (Beijing noon), not peak/off-peak scheduling. */
export const DEEPSEEK_FLASH_RELEASE_AT = "2026-09-10T04:00:00.000Z";
export const DEEPSEEK_FLASH_KEY = "deepseek:deepseek-flash" as const;
export const DEEPSEEK_FLASH_ALIASES = ["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"] as const;

/** USD per million tokens, verified against the official pricing page on 2026-09-10. */
export function deepSeekPeakPricing(apiModel: string, now = new Date().toISOString()): ModelPricing | undefined {
  if (!DEEPSEEK_FLASH_ALIASES.some((alias) => alias === apiModel)) return undefined;
  const oldFlash = apiModel !== "deepseek-flash" && Date.parse(now) < Date.parse(DEEPSEEK_FLASH_RELEASE_AT);
  const [input, output, cache] = oldFlash ? [0.44, 1.32, 0.014] : [0.30, 1.20, 0.006];
  return { currency: "USD", inputCacheMissPerMillion: input, outputPerMillion: output, inputCacheHitPerMillion: cache };
}

export function deepSeekModelDefinition(apiModel: string, now = new Date().toISOString()): ModelDefinition | undefined {
  const pricing = deepSeekPeakPricing(apiModel, now);
  if (!pricing) return undefined;
  return {
    key: DEEPSEEK_FLASH_KEY,
    provider: "deepseek", api: "openai-completions", apiModel: "deepseek-flash",
    label: "deepseek-flash",
    source: "builtin", contextWindow: 1_000_000, maxTokens: 393_216, thinkingDefault: true,
    capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high", "max"], reasoningDefaultEffort: "high" },
    pricing, catalogUpdatedAt: DEEPSEEK_FLASH_RELEASE_AT,
  };
}
