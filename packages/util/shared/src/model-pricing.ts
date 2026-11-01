import { deepSeekPeakPricing, DEEPSEEK_FLASH_RELEASE_AT } from "./deepseek-model-facts";
import { CNY_PER_USD } from "./usage-cost";
import type { ModelPricing } from "./model-config";
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

/**
 * 运行时价格快照。
 * - configured：ModelStoreService 按「用户 > 服务商 > 目录」算好的最终单价（参考价已乘过倍率），原样包装，不再乘。
 * - DeepSeek 官方地址：按固定高峰价估算 × 倍率；用户手填的价格优先。
 * - 都没有（CLI 等没有设置层的调用方）：按地址归属查目录价 × 倍率。
 */
export function resolveModelPricing(catalog: ModelCatalogSnapshot, input: { providerId: string; apiModel: string; modelKey: string; baseUrl: string; connectionId?: string; multiplier?: number; configured?: ModelPricing; configuredByUser?: boolean; unsupportedBilling?: boolean; now?: string }): ModelPricingSnapshot | null {
  const multiplier = input.multiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier < 0) return null;
  const owner = catalogProviderForEndpoint(input.baseUrl);
  const capturedAt = input.now ?? new Date().toISOString();
  const configured = input.configured;
  // Keep fixed peak estimates; release boundaries only change the published model tariff.
  const peak = owner === "deepseek" && !input.configuredByUser ? deepSeekPeakPricing(input.apiModel, capturedAt) : undefined;
  if (peak) return { providerId: owner!, connectionId: input.connectionId ?? null, modelKey: input.modelKey, apiModel: input.apiModel, currency: "USD", rates: { input: peak.inputCacheMissPerMillion * multiplier, output: peak.outputPerMillion * multiplier, cacheRead: peak.inputCacheHitPerMillion * multiplier, cacheWrite: null }, multiplier, source: "deepseek-official", strategy: "fixed-peak", contentHash: `deepseek-peak-20260910:${JSON.stringify(peak)}`, fetchedAt: DEEPSEEK_FLASH_RELEASE_AT, capturedAt, unsupportedBilling: false };
  const entry = configured || !owner ? undefined : catalog.entries.find((row) => row.sourceProviderId === owner && row.apiModel === input.apiModel);
  if (!configured && !entry) return null;
  const baseRates = configured ? { input: configured.inputCacheMissPerMillion, output: configured.outputPerMillion, cacheRead: configured.inputCacheHitPerMillion, cacheWrite: configured.inputCacheWritePerMillion ?? null } : entry!.rates;
  const currencyFactor = (configured?.currency ?? entry!.currency) === "CNY" ? 1 / CNY_PER_USD : 1;
  const factor = configured ? currencyFactor : multiplier * currencyFactor;
  const rate = (value: number | null) => value === null ? null : value * factor;
  return { providerId: configured ? input.providerId : owner!, connectionId: input.connectionId ?? null, modelKey: input.modelKey, apiModel: input.apiModel, currency: "USD", rates: { input: rate(baseRates.input), output: rate(baseRates.output), cacheRead: rate(baseRates.cacheRead), cacheWrite: rate(baseRates.cacheWrite) }, multiplier, source: configured ? "configured" : entry!.source, contentHash: configured ? JSON.stringify(configured) : catalog.contentHash, fetchedAt: configured ? capturedAt : entry!.fetchedAt ?? catalog.generatedAt, capturedAt, unsupportedBilling: configured ? input.unsupportedBilling === true || configured.reasoningPerMillion !== undefined : entry!.unsupportedBilling };
}
