import type { ModelApi } from "./model-config";
import type { ModelFacts } from "./model-layers";
import { thinkingProfileFor } from "./model-thinking-profiles";

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positive = (value: unknown): number | undefined => {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
};
const rate = (value: unknown): number | null => {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Number((n * 1_000_000).toFixed(8)) : null;
};

/**
 * 连接 /models 返回的一行 → 服务商数据。只认常见字段（OpenRouter 风格、Anthropic models API），
 * 认不出的字段留空，交给目录或用户补。价格是每 token 单价，换算成每百万 token。
 */
export function normalizeProviderModelFacts(raw: unknown, protocol: ModelApi): ModelFacts {
  const row = object(raw);
  const facts: ModelFacts = {};
  const id = typeof row.id === "string" ? row.id : "";
  const label = typeof row.display_name === "string" ? row.display_name : typeof row.name === "string" && row.name !== id ? row.name : undefined;
  if (label) facts.label = label;
  const context = positive(row.context_length) ?? positive(row.max_input_tokens) ?? positive(row.context_window);
  if (context) facts.contextWindow = context;
  const output = positive(object(row.top_provider).max_completion_tokens) ?? positive(row.max_output_tokens) ?? positive(row.max_tokens);
  if (output) facts.maxOutput = output;
  const modalities = object(row.architecture).input_modalities ?? row.input_modalities ?? row.modalities;
  if (Array.isArray(modalities)) facts.input = modalities.includes("image") ? ["text", "image"] : ["text"];
  const params = row.supported_parameters;
  if (Array.isArray(params)) facts.thinking = params.includes("reasoning") ? thinkingProfileFor(id, protocol) : { levels: [] };
  const pricing = object(row.pricing);
  const input = rate(pricing.prompt);
  const outputRate = rate(pricing.completion);
  if (input !== null && outputRate !== null) {
    facts.rates = { input, output: outputRate, cacheRead: rate(pricing.input_cache_read), cacheWrite: rate(pricing.input_cache_write) };
    facts.ratesUnsupported = ["request", "image", "web_search", "internal_reasoning"].some((key) => (rate(pricing[key]) ?? 0) > 0);
  }
  return facts;
}
