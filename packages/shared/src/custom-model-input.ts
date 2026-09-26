import { applyCustomModelReasoning, validateCustomModelReasoning, type CustomModelReasoning } from "./custom-model-reasoning";
import type { ModelApi, ModelDefinition, ModelInputKind, ModelKey, ModelPricing } from "./model-config";
import type { ProviderId } from "./provider-config";
import type { ModelCatalogEntry } from "./model-catalog";
import { BUILTIN_MODEL_CATALOG } from "./generated/model-catalog.generated";
import { billingReferenceProvider } from "./model-pricing";

export type CustomModelPricingInput = ModelPricing | null;

export interface CustomModelDraftInput {
  readonly apiModel: string;
  readonly label?: string;
  readonly enabled: boolean;
  readonly contextWindow: number | null;
  readonly maxTokens: number | null;
  readonly input: readonly ["text"] | readonly ["text", "image"];
  readonly reasoningConfig: CustomModelReasoning;
  readonly pricing: CustomModelPricingInput;
}

export interface CustomModelCreateInput extends CustomModelDraftInput {
  readonly connectionId: string;
  readonly setAsConnectionDefault: boolean;
}

export type CustomModelEditableFields = Omit<CustomModelDraftInput, "apiModel">;
export type CustomModelEditInput = CustomModelEditableFields & { readonly modelKey: ModelKey };
export type CustomModelSetDefaultInput = { readonly connectionId: string; readonly modelKey: ModelKey };

export function customConnectionModelKey(providerId: ProviderId, connectionId: string, apiModel: string): ModelKey {
  return `${providerId}:connection/${encodeURIComponent(connectionId)}/${encodeURIComponent(apiModel)}`;
}

/** 按模型 ID 精确查内置目录；同一 ID 有多条时优先厂商官方条目，其次 OpenRouter。 */
export function findBuiltinCatalogModel(apiModel: string): ModelCatalogEntry | undefined {
  const id = apiModel.trim();
  const rows = BUILTIN_MODEL_CATALOG.entries.filter((row) => row.apiModel === id);
  return rows.find((row) => row.sourceProviderId !== "openrouter") ?? rows[0];
}

/** 「按官方价折算」时计费实际查的目录条目：只看协议对应厂商（Anthropic / OpenAI）的官方价。 */
export function findReferenceCatalogModel(apiModel: string, protocol: ModelApi): ModelCatalogEntry | undefined {
  const id = apiModel.trim();
  const provider = billingReferenceProvider(protocol);
  return BUILTIN_MODEL_CATALOG.entries.find((row) => row.sourceProviderId === provider && row.apiModel === id);
}

/** 向导里勾选的模型：能力从目录自动匹配，价格跟随连接的计费方式，不在模型上手填。 */
export function customModelDraftFromCatalog(apiModel: string): CustomModelDraftInput {
  const entry = findBuiltinCatalogModel(apiModel);
  return {
    apiModel: apiModel.trim(),
    enabled: true,
    contextWindow: entry?.contextWindow ?? null,
    maxTokens: entry?.maxOutput ?? null,
    input: entry?.input.includes("image") ? ["text", "image"] : ["text"],
    reasoningConfig: { mode: "auto" },
    pricing: null,
  };
}

export function buildCustomModelDefinition(
  input: CustomModelDraftInput,
  connection: { readonly providerId: ProviderId; readonly protocol: ModelApi; readonly connectionId: string },
): ModelDefinition {
  const apiModel = normalizeApiModel(input.apiModel);
  validateCustomModelReasoning(input.reasoningConfig);
  const definition: ModelDefinition = {
    key: customConnectionModelKey(connection.providerId, connection.connectionId, apiModel),
    provider: connection.providerId,
    api: connection.protocol,
    apiModel,
    label: input.label?.trim() || apiModel,
    source: "custom",
    contextWindow: normalizeNullablePositiveInteger(input.contextWindow, "上下文窗口"),
    maxTokens: normalizeNullablePositiveInteger(input.maxTokens, "最大输出 Token"),
    thinkingDefault: false,
    capabilities: {
      input: normalizeInput(input.input),
      toolUse: "declared",
      reasoning: false,
      thinkingToggle: false,
    },
    ...(input.pricing ? { pricing: normalizeCustomModelPricing(input.pricing) } : {}),
  };
  return applyCustomModelReasoning(definition, input.reasoningConfig);
}

export function normalizeCustomModelPricing(pricing: ModelPricing): ModelPricing {
  if (pricing.currency !== "USD" && pricing.currency !== "CNY") throw new Error("价格币种无效。");
  return {
    currency: pricing.currency,
    inputCacheMissPerMillion: normalizeRate(pricing.inputCacheMissPerMillion, "标准输入"),
    outputPerMillion: normalizeRate(pricing.outputPerMillion, "输出"),
    inputCacheHitPerMillion: normalizeRate(pricing.inputCacheHitPerMillion, "缓存读取"),
    inputCacheWritePerMillion: normalizeRate(pricing.inputCacheWritePerMillion, "缓存写入"),
  };
}

function normalizeApiModel(value: string): string {
  const model = value.trim();
  if (!model || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) throw new Error("API 模型 ID 无效。");
  return model;
}

function normalizeNullablePositiveInteger(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000_000) throw new Error(`${label}必须是正整数或留空。`);
  return value;
}

function normalizeInput(value: readonly ModelInputKind[]): ModelInputKind[] {
  if (value.length === 1 && value[0] === "text") return ["text"];
  if (value.length === 2 && value[0] === "text" && value[1] === "image") return ["text", "image"];
  throw new Error("模型输入能力无效。");
}

function normalizeRate(value: number | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error(`${label}价格必须是 0 到 1000000 之间的数字。`);
  return Math.round(value * 100_000_000) / 100_000_000;
}
