/** Public catalogue facts. Prices are per million tokens; null never means free. */
export type CatalogSource = "models.dev" | "openrouter";
export type CatalogRates = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
};
export type ModelCatalogEntry = {
  source: CatalogSource;
  fetchedAt?: string;
  sourceProviderId: string;
  apiModel: string;
  name: string;
  /** Catalog ingestion normalizes external currencies before storing entries. */
  currency: "USD";
  rates: CatalogRates;
  unsupportedBilling: boolean;
  contextWindow: number | null;
  maxOutput: number | null;
  input: string[];
  reasoning: boolean;
};
/** 改价清单的一行：按来源和服务商指定一个已有模型的价格，见 model-catalog-overrides.ts。 */
export type ModelCatalogPriceOverride = {
  source: CatalogSource;
  sourceProviderId: string;
  apiModel: string;
  rates: CatalogRates;
  /** 价格来源链接。 */
  sourceUrl: string;
  /** 核对日期，YYYY-MM-DD。 */
  checkedAt: string;
};
export type ModelCatalogSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  contentHash: string;
  entries: ModelCatalogEntry[];
};
export type ModelPricingSnapshot = {
  providerId: string;
  connectionId: string | null;
  modelKey: string;
  apiModel: string;
  /** Runtime snapshots are normalized at the boundary and always use USD. */
  currency: "USD";
  rates: CatalogRates;
  multiplier: number;
  source: CatalogSource | "configured" | "deepseek-official";
  strategy?: "fixed-peak";
  contentHash: string;
  fetchedAt: string;
  capturedAt: string;
  unsupportedBilling: boolean;
};
export type UsageCostProvenance = {
  version: 1;
  basis: "provider-reported" | "estimated" | "unknown";
  reason: string | null;
  pricingSnapshot: ModelPricingSnapshot | null;
};
