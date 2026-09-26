import { deepSeekPeakPricing, DEEPSEEK_FLASH_RELEASE_AT } from "./deepseek-model-facts";
import { CNY_PER_USD } from "./usage-cost";
import type { ModelApi, ModelPricing } from "./model-config";
import type { CustomConnectionBillingMode } from "./settings";
import type { ModelCatalogSnapshot, ModelPricingSnapshot } from "./model-catalog";

/** Resolve by endpoint owner, not the legacy credential namespace or display name. */
export function catalogProviderForEndpoint(baseUrl: string): string | null {
  try {
    const host = /^https:\/\/([^/:?#]+)(?::443)?(?:\/|$)/i.exec(baseUrl)?.[1]?.toLowerCase();
    if (!host) return null;
    const providers: Record<string, string> = { "api.deepseek.com": "deepseek", "api.moonshot.cn": "moonshotai-cn", "api.moonshot.ai": "moonshotai", "openrouter.ai": "openrouter", "api.openai.com": "openai", "api.anthropic.com": "anthropic", "api.x.ai": "xai", "api.minimax.io": "minimax", "api.minimaxi.com": "minimax-cn", "open.bigmodel.cn": "zhipuai" };
    return providers[host] ?? null;
  } catch { return null; }
}

/** 按官方价折算时，中转站地址没有归属，改按协议对应的厂商目录查价。 */
export function billingReferenceProvider(protocol: ModelApi): string {
  return protocol === "anthropic-messages" ? "anthropic" : "openai";
}

/**
 * billingMode 只对自定义连接有意义；缺省保持升级前的行为。
 * - token：不计价。
 * - reference：地址归属查不到时，用 referenceProviderId 再查一次；模型上手填的单价优先且不乘倍率。
 */
export function resolveModelPricing(catalog: ModelCatalogSnapshot, input: { providerId: string; apiModel: string; modelKey: string; baseUrl: string; connectionId?: string; multiplier?: number; configured?: ModelPricing; configuredAlreadyMultiplied?: boolean; billingMode?: CustomConnectionBillingMode; referenceProviderId?: string; now?: string }): ModelPricingSnapshot | null {
  if (input.billingMode === "token") return null;
  const owner = catalogProviderForEndpoint(input.baseUrl);
  const findEntry = (provider: string | null | undefined) => provider ? catalog.entries.find((row) => row.sourceProviderId === provider && row.apiModel === input.apiModel) : undefined;
  const ownerEntry = findEntry(owner);
  const referenceProvider = input.billingMode === "reference" ? input.referenceProviderId : undefined;
  const entry = ownerEntry ?? findEntry(referenceProvider);
  const entryProvider = ownerEntry ? owner : entry ? referenceProvider ?? null : owner;
  const configured = input.configured;
  const configuredUnscaled = Boolean(configured && input.billingMode === "reference");
  const multiplier = configuredUnscaled ? 1 : input.multiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier < 0) return null;
  // Keep fixed peak estimates; release boundaries only change the published model tariff.
  const capturedAt = input.now ?? new Date().toISOString();
  const peak = owner === "deepseek" ? deepSeekPeakPricing(input.apiModel, capturedAt) : undefined;
  if (peak) return { providerId: owner!, connectionId: input.connectionId ?? null, modelKey: input.modelKey, apiModel: input.apiModel, currency: "USD", rates: { input: peak.inputCacheMissPerMillion * multiplier, output: peak.outputPerMillion * multiplier, cacheRead: peak.inputCacheHitPerMillion * multiplier, cacheWrite: null }, multiplier, source: "deepseek-official", strategy: "fixed-peak", contentHash: `deepseek-peak-20260910:${JSON.stringify(peak)}`, fetchedAt: DEEPSEEK_FLASH_RELEASE_AT, capturedAt, unsupportedBilling: false };
  if (!configured && !entry) return null;
  const baseRates = configured ? { input: configured.inputCacheMissPerMillion, output: configured.outputPerMillion, cacheRead: configured.inputCacheHitPerMillion, cacheWrite: configured.inputCacheWritePerMillion ?? null } : entry!.rates;
  const sourceCurrency = configured?.currency ?? entry!.currency;
  const currencyFactor = sourceCurrency === "CNY" ? 1 / CNY_PER_USD : 1;
  const factor = configured && (input.configuredAlreadyMultiplied || configuredUnscaled) ? 1 : multiplier;
  const rate = (value: number | null) => value === null ? null : value * factor * currencyFactor;
  return { providerId: entryProvider ?? input.providerId, connectionId: input.connectionId ?? null, modelKey: input.modelKey, apiModel: input.apiModel, currency: "USD", rates: { input: rate(baseRates.input), output: rate(baseRates.output), cacheRead: rate(baseRates.cacheRead), cacheWrite: rate(baseRates.cacheWrite) }, multiplier, source: configured ? "configured" : entry!.source, contentHash: configured ? JSON.stringify(configured) : catalog.contentHash, fetchedAt: configured ? input.now ?? new Date().toISOString() : entry!.fetchedAt ?? catalog.generatedAt, capturedAt: input.now ?? new Date().toISOString(), unsupportedBilling: configured ? configured.reasoningPerMillion !== undefined : entry!.unsupportedBilling };
}
