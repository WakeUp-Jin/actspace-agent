/** Public catalogue facts. Prices are per million tokens; null never means free. */
export type CatalogSource = "models.dev" | "openrouter";
export type CatalogRates = { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null };
export type ModelCatalogEntry = {
  source: CatalogSource;
  fetchedAt?: string;
  sourceProviderId: string;
  apiModel: string;
  name: string;
  currency: "USD" | "CNY";
  rates: CatalogRates;
  unsupportedBilling: boolean;
  contextWindow: number | null;
  maxOutput: number | null;
  input: string[];
  reasoning: boolean;
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
  currency: "USD" | "CNY";
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
export type ModelCatalogStatus = {
  state: "idle" | "updating" | "failed";
  updatedAt: string;
  error?: string;
  entries: ModelCatalogEntry[];
};
