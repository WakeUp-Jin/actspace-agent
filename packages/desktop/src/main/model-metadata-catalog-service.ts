import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  MODEL_REASONING_EFFORTS,
  type ModelMetadataCatalogResult,
  type ModelMetadataSource,
  type ModelMetadataSourceState,
  type ModelMetadataView,
  type ModelReasoningEffort,
} from "@actspace/shared";

const CACHE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RESULT_LIMIT = 80;
const MAX_RESPONSE_CHARS = 25_000_000;
const MODELS_DEV_URL = "https://models.dev/api.json";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";

type MetadataCache = {
  version: 1;
  fetchedAt: string;
  models: ModelMetadataView[];
  skippedCount: number;
  sources: ModelMetadataSourceState[];
};

type SourceLoadResult = {
  source: ModelMetadataSource;
  models: ModelMetadataView[];
  skippedCount: number;
  fetchedAt?: string;
  error?: string;
};

export interface ModelMetadataCatalogServiceOptions {
  dataRoot: string;
  timeoutMs?: number;
  staleAfterMs?: number;
  resultLimit?: number;
  now?: () => Date;
  fetch?: typeof globalThis.fetch;
  writeJson?: (filePath: string, value: unknown) => Promise<void>;
}

export class ModelMetadataCatalogService {
  private readonly cachePath: string;
  private readonly timeoutMs: number;
  private readonly staleAfterMs: number;
  private readonly resultLimit: number;
  private readonly now: () => Date;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly writeJson: (filePath: string, value: unknown) => Promise<void>;
  private cache: MetadataCache | null = null;

  constructor(options: ModelMetadataCatalogServiceOptions) {
    this.cachePath = join(options.dataRoot, "model-metadata", "models-cache.json");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.resultLimit = options.resultLimit ?? DEFAULT_RESULT_LIMIT;
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.writeJson = options.writeJson ?? writeJsonAtomic;
  }

  async load(): Promise<ModelMetadataCatalogResult> {
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as unknown;
      if (!isMetadataCache(parsed)) throw new Error("invalid cache");
      this.cache = parsed;
      return this.search("");
    } catch (error) {
      if (!isMissingFile(error)) await this.moveCorruptCacheBestEffort();
      this.cache = null;
      return {
        ...this.search(""),
        ...(!isMissingFile(error) && {
          error: { code: "cache_corrupt", message: "公共模型目录缓存损坏，已隔离并等待重新加载。" },
        }),
      };
    }
  }

  search(query: string): ModelMetadataCatalogResult {
    const base = this.view();
    if (!this.cache) return base;
    const normalized = normalizeSearchText(query);
    const models = normalized
      ? this.cache.models
        .map((model) => ({ model, score: matchScore(model, normalized) }))
        .filter((item) => item.score < Number.MAX_SAFE_INTEGER)
        .sort((left, right) => left.score - right.score || sourceOrder(left.model.source) - sourceOrder(right.model.source) || left.model.name.localeCompare(right.model.name))
        .slice(0, this.resultLimit)
        .map((item) => clone(item.model))
      : this.cache.models.slice(0, this.resultLimit).map(clone);
    return { ...base, models };
  }

  find(metadataKey: string): ModelMetadataView | undefined {
    const model = this.cache?.models.find((item) => item.key === metadataKey);
    return model ? clone(model) : undefined;
  }

  async reload(): Promise<ModelMetadataCatalogResult> {
    const fetchedAt = this.now().toISOString();
    const results = await Promise.all([
      this.loadSource("models.dev", MODELS_DEV_URL, fetchedAt),
      this.loadSource("openrouter", OPENROUTER_URL, fetchedAt),
    ]);
    const succeeded = results.filter((result) => !result.error);
    if (succeeded.length === 0) {
      return {
        ...this.view(this.cache ? "stale" : "error"),
        error: { code: "network", message: "公共模型目录加载失败，已保留上次缓存。" },
        sources: results.map(toSourceState),
      };
    }

    const failedSources = new Set(results.filter((result) => result.error).map((result) => result.source));
    const preserved = this.cache?.models.filter((model) => failedSources.has(model.source)) ?? [];
    const models = deduplicateModels([...succeeded.flatMap((result) => result.models), ...preserved]);
    const cache: MetadataCache = {
      version: CACHE_VERSION,
      fetchedAt,
      models,
      skippedCount: results.reduce((sum, result) => sum + result.skippedCount, 0),
      sources: results.map((result) => result.error && this.cache?.models.some((model) => model.source === result.source)
        ? {
            source: result.source,
            status: "stale",
            fetchedAt: this.cache.sources.find((source) => source.source === result.source)?.fetchedAt,
            error: result.error,
          }
        : toSourceState(result)),
    };
    try {
      await this.writeJson(this.cachePath, cache);
    } catch {
      return {
        ...this.view(this.cache ? "stale" : "error"),
        error: { code: "cache_write", message: "公共模型目录已加载，但缓存写入失败。" },
        sources: cache.sources,
      };
    }
    this.cache = cache;
    return this.search("");
  }

  private async loadSource(
    source: ModelMetadataSource,
    url: string,
    fetchedAt: string,
  ): Promise<SourceLoadResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return { source, models: [], skippedCount: 0, error: `HTTP ${response.status}` };
      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_CHARS) return { source, models: [], skippedCount: 0, error: "response_too_large" };
      const payload = JSON.parse(raw) as unknown;
      return source === "models.dev"
        ? { source, fetchedAt, ...normalizeModelsDev(payload, fetchedAt) }
        : { source, fetchedAt, ...normalizeOpenRouter(payload, fetchedAt) };
    } catch (error) {
      const message = controller.signal.aborted || (error instanceof Error && error.name === "AbortError")
        ? "timeout"
        : "network";
      return { source, models: [], skippedCount: 0, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private view(forceState?: ModelMetadataCatalogResult["state"]): ModelMetadataCatalogResult {
    if (!this.cache) {
      return { state: forceState ?? "empty", stale: false, models: [], skippedCount: 0, sources: [] };
    }
    const stale = this.now().getTime() - new Date(this.cache.fetchedAt).getTime() > this.staleAfterMs;
    return {
      state: forceState ?? (stale ? "stale" : "ready"),
      fetchedAt: this.cache.fetchedAt,
      stale,
      models: this.cache.models.slice(0, this.resultLimit).map(clone),
      skippedCount: this.cache.skippedCount,
      sources: this.cache.sources.map((source) => stale && source.status === "ready"
        ? { ...source, status: "stale" }
        : { ...source }),
    };
  }

  private async moveCorruptCacheBestEffort(): Promise<void> {
    const suffix = this.now().toISOString().replace(/[:.]/g, "-");
    try {
      await rename(this.cachePath, `${this.cachePath}.corrupt-${suffix}`);
    } catch {
      // Cache recovery must not stop application startup.
    }
  }
}

function normalizeModelsDev(value: unknown, fetchedAt: string): { models: ModelMetadataView[]; skippedCount: number } {
  if (!isRecord(value)) return { models: [], skippedCount: 1 };
  const models: ModelMetadataView[] = [];
  let skippedCount = 0;
  for (const [providerId, providerValue] of Object.entries(value)) {
    if (!isRecord(providerValue) || !isRecord(providerValue.models)) continue;
    for (const [fallbackId, modelValue] of Object.entries(providerValue.models)) {
      const model = normalizeModelsDevModel(providerId, fallbackId, modelValue, fetchedAt);
      if (model) models.push(model);
      else skippedCount += 1;
    }
  }
  return { models, skippedCount };
}

function normalizeModelsDevModel(
  provider: string,
  fallbackId: string,
  value: unknown,
  fetchedAt: string,
): ModelMetadataView | undefined {
  if (!isRecord(value)) return undefined;
  const modelId = cleanText(value.id, 300) || cleanText(fallbackId, 300);
  if (!modelId) return undefined;
  const name = cleanText(value.name, 180) || modelId;
  const modalities = isRecord(value.modalities) && Array.isArray(value.modalities.input) ? value.modalities.input : [];
  const input: Array<"text" | "image"> = [
    ...(modalities.includes("text") ? ["text" as const] : []),
    ...(modalities.includes("image") ? ["image" as const] : []),
  ];
  if (input.length === 0) input.push("text");
  const reasoning = value.reasoning === true;
  const efforts = normalizeModelsDevReasoningEfforts(value.reasoning_options);
  const cost = isRecord(value.cost) ? value.cost : undefined;
  const pricing = normalizePerMillionPricing(cost);
  return {
    key: `models.dev:${provider}:${modelId}`,
    source: "models.dev",
    provider,
    modelId,
    name,
    aliases: uniqueStrings([modelId, `${provider}/${modelId}`, name]),
    contextWindow: readPositiveInteger(isRecord(value.limit) ? value.limit.context : undefined),
    maxTokens: readPositiveInteger(isRecord(value.limit) ? value.limit.output : undefined),
    capabilities: {
      input,
      toolUse: value.tool_call === true ? "declared" : value.tool_call === false ? "unsupported" : "unknown",
      reasoning,
      thinkingToggle: reasoning && Array.isArray(value.reasoning_options) && value.reasoning_options.some(
        (option) => isRecord(option) && option.type === "toggle",
      ),
      ...(efforts && { reasoningEfforts: efforts }),
    },
    ...(pricing && { pricing }),
    fetchedAt,
  };
}

function normalizeOpenRouter(value: unknown, fetchedAt: string): { models: ModelMetadataView[]; skippedCount: number } {
  const rows = isRecord(value) && Array.isArray(value.data) ? value.data : [];
  const models: ModelMetadataView[] = [];
  let skippedCount = 0;
  for (const row of rows) {
    const model = normalizeOpenRouterModel(row, fetchedAt);
    if (model) models.push(model);
    else skippedCount += 1;
  }
  return { models, skippedCount };
}

function normalizeOpenRouterModel(value: unknown, fetchedAt: string): ModelMetadataView | undefined {
  if (!isRecord(value)) return undefined;
  const modelId = cleanText(value.id, 300);
  if (!modelId) return undefined;
  const name = cleanText(value.name, 180) || modelId;
  const provider = modelId.includes("/") ? modelId.slice(0, modelId.indexOf("/")) : "openrouter";
  const architecture = isRecord(value.architecture) ? value.architecture : {};
  const modalities = Array.isArray(architecture.input_modalities) ? architecture.input_modalities : [];
  const input: Array<"text" | "image"> = [
    ...(modalities.includes("text") ? ["text" as const] : []),
    ...(modalities.includes("image") ? ["image" as const] : []),
  ];
  if (input.length === 0) input.push("text");
  const supported = Array.isArray(value.supported_parameters) ? value.supported_parameters : [];
  const reasoning = supported.includes("reasoning") || supported.includes("include_reasoning") || isRecord(value.reasoning);
  const pricing = normalizeOpenRouterPricing(value.pricing);
  return {
    key: `openrouter:${provider}:${modelId}`,
    source: "openrouter",
    provider,
    modelId,
    name,
    aliases: uniqueStrings([modelId, modelId.includes("/") ? modelId.slice(modelId.indexOf("/") + 1) : modelId, name]),
    contextWindow: readPositiveInteger(value.context_length),
    maxTokens: readPositiveInteger(isRecord(value.top_provider) ? value.top_provider.max_completion_tokens : undefined),
    capabilities: {
      input,
      toolUse: supported.includes("tools") || supported.includes("tool_choice") ? "declared" : "unknown",
      reasoning,
      thinkingToggle: reasoning,
    },
    ...(pricing && { pricing }),
    fetchedAt,
  };
}

function normalizePerMillionPricing(value: Record<string, unknown> | undefined): ModelMetadataView["pricing"] | undefined {
  if (!value) return undefined;
  const input = readNonNegativeNumber(value.input);
  const output = readNonNegativeNumber(value.output);
  if (input === undefined || output === undefined) return undefined;
  const cacheRead = readNonNegativeNumber(value.cache_read);
  const cacheWrite = readNonNegativeNumber(value.cache_write);
  return {
    currency: "USD",
    inputCacheHitPerMillion: cacheRead ?? input,
    inputCacheMissPerMillion: input,
    ...(cacheWrite !== undefined && { inputCacheWritePerMillion: cacheWrite }),
    outputPerMillion: output,
  };
}

function normalizeOpenRouterPricing(value: unknown): ModelMetadataView["pricing"] | undefined {
  if (!isRecord(value)) return undefined;
  const prompt = readNonNegativeNumber(value.prompt);
  const completion = readNonNegativeNumber(value.completion);
  if (prompt === undefined || completion === undefined) return undefined;
  const cacheRead = readNonNegativeNumber(value.input_cache_read);
  const cacheWrite = readNonNegativeNumber(value.input_cache_write);
  return {
    currency: "USD",
    inputCacheHitPerMillion: roundPrice((cacheRead ?? prompt) * 1_000_000),
    inputCacheMissPerMillion: roundPrice(prompt * 1_000_000),
    ...(cacheWrite !== undefined && { inputCacheWritePerMillion: roundPrice(cacheWrite * 1_000_000) }),
    outputPerMillion: roundPrice(completion * 1_000_000),
  };
}

function normalizeModelsDevReasoningEfforts(value: unknown): ModelReasoningEffort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set<string>(MODEL_REASONING_EFFORTS);
  const efforts = value.flatMap((option) => isRecord(option) && option.type === "effort" && Array.isArray(option.values)
    ? option.values.filter((effort): effort is ModelReasoningEffort => typeof effort === "string" && allowed.has(effort))
    : []);
  return efforts.length > 0 ? [...new Set(efforts)] : undefined;
}

function matchScore(model: ModelMetadataView, query: string): number {
  const id = normalizeSearchText(model.modelId);
  const suffix = normalizeSearchText(model.modelId.includes("/") ? model.modelId.slice(model.modelId.indexOf("/") + 1) : model.modelId);
  const name = normalizeSearchText(model.name);
  const aliases = model.aliases.map(normalizeSearchText);
  if (id === query) return 0;
  if (suffix === query) return 1;
  if (name === query) return 2;
  if (aliases.includes(query)) return 3;
  if (id.startsWith(query) || suffix.startsWith(query) || name.startsWith(query)) return 10;
  if (aliases.some((alias) => alias.startsWith(query))) return 11;
  if (id.includes(query) || suffix.includes(query) || name.includes(query) || aliases.some((alias) => alias.includes(query))) return 20;
  return Number.MAX_SAFE_INTEGER;
}

function deduplicateModels(models: ModelMetadataView[]): ModelMetadataView[] {
  return [...new Map(models.map((model) => [model.key, model])).values()]
    .sort((left, right) => sourceOrder(left.source) - sourceOrder(right.source) || left.name.localeCompare(right.name));
}

function toSourceState(result: SourceLoadResult): ModelMetadataSourceState {
  return result.error
    ? { source: result.source, status: "unavailable", error: result.error }
    : { source: result.source, status: "ready", fetchedAt: result.fetchedAt };
}

function sourceOrder(source: ModelMetadataSource): number {
  return source === "models.dev" ? 0 : 1;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function roundPrice(value: number): number {
  return Number(value.toFixed(8));
}

function isMetadataCache(value: unknown): value is MetadataCache {
  return isRecord(value) && value.version === CACHE_VERSION && typeof value.fetchedAt === "string" &&
    Array.isArray(value.models) && value.models.every(isMetadataModel) &&
    typeof value.skippedCount === "number" && Array.isArray(value.sources);
}

function isMetadataModel(value: unknown): value is ModelMetadataView {
  return isRecord(value) && typeof value.key === "string" &&
    (value.source === "models.dev" || value.source === "openrouter") &&
    typeof value.provider === "string" && typeof value.modelId === "string" &&
    typeof value.name === "string" && Array.isArray(value.aliases) && typeof value.fetchedAt === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}
