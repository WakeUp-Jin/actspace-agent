import type { CatalogSource, ModelCatalogEntry } from "./model-catalog";

// Endpoint owners supported by current connection presets; never enables an adapter.
export const CATALOG_PROVIDERS = ["deepseek", "moonshotai", "moonshotai-cn", "openai", "anthropic", "xai", "minimax", "minimax-cn", "zhipuai", "zhipuai-coding-plan"];
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function catalogRate(value: unknown, factor = 1): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const n = Number(value) * factor;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function normalizeModelCatalog(source: CatalogSource, payload: unknown): ModelCatalogEntry[] {
  const root = object(payload);
  if (source === "openrouter" && !Array.isArray(root.data)) throw new Error("Invalid OpenRouter catalog");
  if (source === "models.dev" && !CATALOG_PROVIDERS.some((id) => object(root[id]).models)) throw new Error("Invalid models.dev catalog");
  const rows: Array<{ provider: string; value: unknown }> = source === "openrouter"
    ? (Array.isArray(root.data) ? root.data : []).map((value: unknown) => ({ provider: "openrouter", value }))
    : CATALOG_PROVIDERS.flatMap((provider) => Object.values(object(object(root[provider]).models)).map((value) => ({ provider, value })));
  const entries: ModelCatalogEntry[] = [];
  for (const { provider, value } of rows) {
    const row = object(value);
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    const cost = object(source === "openrouter" ? row.pricing : row.cost);
    const factor = source === "openrouter" ? 1_000_000 : 1;
    const rates = { input: catalogRate(cost[source === "openrouter" ? "prompt" : "input"], factor), output: catalogRate(cost[source === "openrouter" ? "completion" : "output"], factor), cacheRead: catalogRate(cost[source === "openrouter" ? "input_cache_read" : "cache_read"], factor), cacheWrite: catalogRate(cost[source === "openrouter" ? "input_cache_write" : "cache_write"], factor) };
    // A tier or non-token charge cannot safely be approximated by the base rates.
    const unsupportedBilling = (Array.isArray(cost.tiers) && cost.tiers.length > 0) || ["request", "image", "audio", "web_search", "internal_reasoning"].some((key) => (catalogRate(cost[key]) ?? 0) > 0);
    const modalities = source === "openrouter" ? object(row.architecture).input_modalities : object(row.modalities).input;
    entries.push({ source, sourceProviderId: provider, apiModel: row.id, name: typeof row.name === "string" ? row.name : row.id, currency: "USD", rates, unsupportedBilling, contextWindow: catalogRate(row.context_length ?? object(row.limit).context), maxOutput: catalogRate(object(row.top_provider).max_completion_tokens ?? object(row.limit).output), input: Array.isArray(modalities) ? modalities.filter((v): v is string => typeof v === "string") : ["text"], reasoning: row.reasoning === true || object(row.reasoning).enabled === true || (Array.isArray(row.supported_parameters) && row.supported_parameters.includes("reasoning")) });
  }
  if (!entries.length) throw new Error("Catalog contains no supported models");
  return entries.sort((a, b) => `${a.sourceProviderId}/${a.apiModel}`.localeCompare(`${b.sourceProviderId}/${b.apiModel}`));
}
