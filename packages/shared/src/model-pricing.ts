import { deepSeekPeakPricing, DEEPSEEK_FLASH_RELEASE_AT } from "./deepseek-model-facts";
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

export function resolveModelPricing(catalog: ModelCatalogSnapshot, input: { providerId: string; apiModel: string; modelKey: string; baseUrl: string; connectionId?: string; multiplier?: number; configured?: ModelPricing; configuredAlreadyMultiplied?: boolean; now?: string }): ModelPricingSnapshot | null {
  const owner = catalogProviderForEndpoint(input.baseUrl);
  const entry = catalog.entries.find((row) => row.sourceProviderId === owner && row.apiModel === input.apiModel);
  const configured = input.configured;
  const multiplier = input.multiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier < 0) return null;
  // Keep fixed peak estimates; release boundaries only change the published model tariff.
  const capturedAt = input.now ?? new Date().toISOString();
  const peak = owner === "deepseek" ? deepSeekPeakPricing(input.apiModel, capturedAt) : undefined;
  if (peak) return { providerId: owner!, connectionId: input.connectionId ?? null, modelKey: input.modelKey, apiModel: input.apiModel, currency: "USD", rates: { input: peak.inputCacheMissPerMillion * multiplier, output: peak.outputPerMillion * multiplier, cacheRead: peak.inputCacheHitPerMillion * multiplier, cacheWrite: null }, multiplier, source: "deepseek-official", strategy: "fixed-peak", contentHash: `deepseek-peak-20260910:${JSON.stringify(peak)}`, fetchedAt: DEEPSEEK_FLASH_RELEASE_AT, capturedAt, unsupportedBilling: false };
  if (!configured && !entry) return null;
  const baseRates = configured ? { input: configured.inputCacheMissPerMillion, output: configured.outputPerMillion, cacheRead: configured.inputCacheHitPerMillion, cacheWrite: configured.inputCacheWritePerMillion ?? null } : entry!.rates;
  const factor = configured && input.configuredAlreadyMultiplied ? 1 : multiplier;
  const rate = (value: number | null) => value === null ? null : value * factor;
  return { providerId: owner ?? input.providerId, connectionId: input.connectionId ?? null, modelKey: input.modelKey, apiModel: input.apiModel, currency: configured?.currency ?? entry!.currency, rates: { input: rate(baseRates.input), output: rate(baseRates.output), cacheRead: rate(baseRates.cacheRead), cacheWrite: rate(baseRates.cacheWrite) }, multiplier, source: configured ? "configured" : entry!.source, contentHash: configured ? JSON.stringify(configured) : catalog.contentHash, fetchedAt: configured ? input.now ?? new Date().toISOString() : entry!.fetchedAt ?? catalog.generatedAt, capturedAt: input.now ?? new Date().toISOString(), unsupportedBilling: configured ? configured.reasoningPerMillion !== undefined : entry!.unsupportedBilling };
}
