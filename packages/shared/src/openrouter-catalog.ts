import type { ModelDefinition } from "./model-config";

export type CatalogCacheState = "missing" | "fresh" | "stale" | "offline";

export type CatalogModelView = {
  provider: "openrouter";
  apiModel: string;
  name: string;
  contextWindow: number | null;
  maxTokens: number | null;
  input: Array<"text" | "image">;
  toolUse: "declared" | "unknown";
  reasoning: boolean;
  isFree: boolean;
  pricing?: ModelDefinition["pricing"];
  added: boolean;
};

export interface OpenRouterCatalogCache {
  version: 1;
  fetchedAt: string;
  sourceUrl: string;
  models: CatalogModelView[];
  skippedCount: number;
}
