import type { ModelCapabilities, ModelPricing } from "./model-config";

export type ModelMetadataSource = "models.dev" | "openrouter";

export type ModelMetadataView = {
  key: string;
  source: ModelMetadataSource;
  provider: string;
  modelId: string;
  name: string;
  aliases: string[];
  contextWindow: number | null;
  maxTokens: number | null;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
  fetchedAt: string;
};

export type ModelMetadataSourceState = {
  source: ModelMetadataSource;
  status: "ready" | "stale" | "unavailable";
  fetchedAt?: string;
  error?: string;
};

export type ModelMetadataCatalogResult = {
  state: "ready" | "stale" | "empty" | "error";
  fetchedAt?: string;
  stale: boolean;
  models: ModelMetadataView[];
  skippedCount: number;
  sources: ModelMetadataSourceState[];
  error?: { code: string; message: string };
};

export type ModelMetadataSearchInput = { query?: string };
