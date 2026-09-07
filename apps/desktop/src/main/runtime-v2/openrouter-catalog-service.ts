import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CatalogCacheState, CatalogModelView, ModelPricing, ModelReasoningEffort, OpenRouterCatalogCache } from "@actspace/shared";
import type { ProviderCatalogFetchResult, ProviderNetworkRuntime } from "./provider-network-service";

export type RuntimeV2CatalogResult = {
  readonly state: CatalogCacheState;
  readonly fetchedAt?: string;
  readonly stale: boolean;
  readonly models: CatalogModelView[];
  readonly skippedCount: number;
  readonly error?: { readonly code: string; readonly message: string };
};

export type RuntimeV2OpenRouterCatalogOptions = {
  readonly pricingCatalog?: () => import("@actspace/shared").ModelCatalogSnapshot;
  readonly dataRoot: string;
  readonly fetchCatalog: (runtime: ProviderNetworkRuntime) => Promise<ProviderCatalogFetchResult>;
  readonly isAdded: (apiModel: string) => boolean;
  readonly now?: () => Date;
  readonly staleAfterMs?: number;
};

const CACHE_VERSION = 1;
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1_000;

export class RuntimeV2OpenRouterCatalogService {
  readonly #pricingCatalog?: RuntimeV2OpenRouterCatalogOptions["pricingCatalog"];
  readonly #cachePath: string;
  readonly #fetchCatalog: RuntimeV2OpenRouterCatalogOptions["fetchCatalog"];
  readonly #isAdded: RuntimeV2OpenRouterCatalogOptions["isAdded"];
  readonly #now: () => Date;
  readonly #staleAfterMs: number;
  #cache: OpenRouterCatalogCache | null = null;

  constructor(options: RuntimeV2OpenRouterCatalogOptions) {
    this.#pricingCatalog = options.pricingCatalog;
    this.#cachePath = join(options.dataRoot, "providers", "openrouter", "models-cache.json");
    this.#fetchCatalog = options.fetchCatalog;
    this.#isAdded = options.isAdded;
    this.#now = options.now ?? (() => new Date());
    this.#staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  }

  async load(): Promise<RuntimeV2CatalogResult> {
    try {
      const parsed = JSON.parse(await readFile(this.#cachePath, "utf8")) as unknown;
      if (!isCatalogCache(parsed)) throw new Error("invalid catalog cache");
      this.#cache = parsed;
      return this.list();
    } catch (error) {
      if (!isMissingFile(error)) await this.#quarantineCorruptCache();
      this.#cache = null;
      return { ...this.list(), ...(!isMissingFile(error) ? { error: { code: "cache_corrupt", message: "Model catalog cache was corrupt and has been quarantined." } } : {}) };
    }
  }

  list(query = ""): RuntimeV2CatalogResult {
    if (!this.#cache && this.#pricingCatalog) {
      const snapshot = this.#pricingCatalog();
      const models = snapshot.entries.filter((row) => row.sourceProviderId === "openrouter" && `${row.name} ${row.apiModel}`.toLowerCase().includes(query.toLowerCase().trim())).map((row): CatalogModelView => this.withPricing({ provider: "openrouter", apiModel: row.apiModel, name: row.name, contextWindow: row.contextWindow, maxTokens: row.maxOutput, input: row.input.includes("image") ? ["text", "image"] : ["text"], toolUse: "unknown", reasoning: row.reasoning, isFree: false, added: this.#isAdded(row.apiModel) }));
      return { state: "fresh", stale: false, fetchedAt: snapshot.generatedAt, models, skippedCount: 0 };
    }
    if (!this.#cache) return { state: "missing", stale: false, models: [], skippedCount: 0 };
    const normalized = query.trim().toLocaleLowerCase();
    const stale = this.#now().getTime() - Date.parse(this.#cache.fetchedAt) > this.#staleAfterMs;
    const models = this.#cache.models
      .filter((model) => !normalized || model.name.toLocaleLowerCase().includes(normalized) || model.apiModel.toLocaleLowerCase().includes(normalized))
      .map((model) => ({ ...model, input: [...model.input], ...(Array.isArray(model.reasoningEfforts) ? { reasoningEfforts: [...model.reasoningEfforts] } : {}), added: this.#isAdded(model.apiModel) }));
    return { state: stale ? "stale" : "fresh", fetchedAt: this.#cache.fetchedAt, stale, models: models.map((row) => this.withPricing(row)), skippedCount: this.#cache.skippedCount };
  }

  findModel(apiModel: string): CatalogModelView | undefined {
    const model = this.list().models.find((item) => item.apiModel === apiModel);
    return model ? { ...model, input: [...model.input], added: this.#isAdded(model.apiModel) } : undefined;
  }

  private withPricing(model: CatalogModelView): CatalogModelView {
    if (!this.#pricingCatalog) return model;
    const fact = this.#pricingCatalog().entries.find((row) => row.sourceProviderId === "openrouter" && row.apiModel === model.apiModel);
    const { pricing: _old, ...rest } = model;
    const rates = fact?.rates;
    if (!rates || rates.input === null || rates.output === null || rates.cacheRead === null || fact?.unsupportedBilling) return { ...rest, isFree: false };
    return { ...rest, isFree: rates.input === 0 && rates.output === 0 && rates.cacheRead === 0 && (rates.cacheWrite === null || rates.cacheWrite === 0), pricing: { currency: fact.currency, inputCacheMissPerMillion: rates.input, outputPerMillion: rates.output, inputCacheHitPerMillion: rates.cacheRead, ...(rates.cacheWrite === null ? {} : { inputCacheWritePerMillion: rates.cacheWrite }) } };
  }

  async reload(runtime: ProviderNetworkRuntime): Promise<RuntimeV2CatalogResult> {
    const fetched = await this.#fetchCatalog(runtime);
    if ("code" in fetched) return this.#refreshFailure(fetched.code, fetched.message);
    const normalized = normalizeCatalogPayload(fetched.payload);
    if (!normalized) return this.#refreshFailure("invalid_payload", "Model catalog response was invalid; the last good catalog was preserved.");
    const fetchedAt = this.#now().toISOString();
    const cache: OpenRouterCatalogCache = { version: CACHE_VERSION, fetchedAt, sourceUrl: `${runtime.baseUrl.replace(/\/+$/, "")}/models`, models: normalized.models, skippedCount: normalized.skippedCount };
    try {
      await writeJsonAtomic(this.#cachePath, cache);
    } catch {
      return this.#refreshFailure("cache_write", "Model catalog refresh was not committed because its local cache could not be written.");
    }
    this.#cache = cache;
    return this.list();
  }

  async #quarantineCorruptCache(): Promise<void> {
    const suffix = this.#now().toISOString().replace(/[:.]/g, "-");
    await rename(this.#cachePath, `${this.#cachePath}.corrupt-${suffix}`).catch(() => undefined);
  }

  #refreshFailure(code: string, message: string): RuntimeV2CatalogResult {
    const current = this.list();
    return { ...current, state: current.state === "missing" ? "missing" : "offline", error: { code, message } };
  }
}

function normalizeCatalogPayload(value: unknown): { readonly models: CatalogModelView[]; readonly skippedCount: number } | undefined {
  if (!isRecord(value) || !Array.isArray(value.data)) return undefined;
  const rows = value.data;
  const models: CatalogModelView[] = [];
  let skippedCount = 0;
  for (const row of rows) {
    const model = normalizeCatalogModel(row);
    if (model) models.push(model);
    else skippedCount += 1;
  }
  return rows.length > 0 && models.length === 0 ? undefined : { models, skippedCount };
}

function normalizeCatalogModel(value: unknown): CatalogModelView | undefined {
  if (!isRecord(value)) return undefined;
  const apiModel = cleanText(value.id, 300);
  if (!apiModel) return undefined;
  const architecture = isRecord(value.architecture) ? value.architecture : {};
  const modalities = Array.isArray(architecture.input_modalities) ? architecture.input_modalities : [];
  const input: Array<"text" | "image"> = [];
  if (modalities.includes("text")) input.push("text");
  if (modalities.includes("image")) input.push("image");
  if (input.length === 0) input.push("text");
  const supported = Array.isArray(value.supported_parameters) ? value.supported_parameters : [];
  const reasoning = normalizeReasoning(value.reasoning);
  const pricing = normalizePricing(value.pricing);
  const topProvider = isRecord(value.top_provider) ? value.top_provider : {};
  return {
    provider: "openrouter",
    apiModel,
    name: cleanText(value.name, 180) || apiModel,
    contextWindow: positiveInteger(value.context_length),
    maxTokens: positiveInteger(topProvider.max_completion_tokens),
    input,
    toolUse: supported.includes("tools") || supported.includes("tool_choice") ? "declared" : "unknown",
    reasoning: Boolean(reasoning) || supported.includes("reasoning") || supported.includes("include_reasoning"),
    ...(reasoning?.efforts !== undefined ? { reasoningEfforts: reasoning.efforts } : {}),
    ...(reasoning?.defaultEffort ? { reasoningDefaultEffort: reasoning.defaultEffort } : {}),
    ...(reasoning?.defaultEnabled !== undefined ? { reasoningDefaultEnabled: reasoning.defaultEnabled } : {}),
    ...(reasoning?.mandatory !== undefined ? { reasoningMandatory: reasoning.mandatory } : {}),
    isFree: pricing ? pricing.inputCacheMissPerMillion === 0 && pricing.outputPerMillion === 0 : false,
    ...(pricing ? { pricing } : {}),
    added: false,
  };
}

function normalizeReasoning(value: unknown): { readonly efforts?: ModelReasoningEffort[] | null; readonly defaultEffort?: ModelReasoningEffort; readonly defaultEnabled?: boolean; readonly mandatory?: boolean } | undefined {
  if (!isRecord(value)) return undefined;
  const efforts = value.supported_efforts === null ? null : Array.isArray(value.supported_efforts) ? value.supported_efforts.filter(isReasoningEffort) : undefined;
  const defaultEffort = isReasoningEffort(value.default_effort) ? value.default_effort : undefined;
  return { ...(efforts !== undefined ? { efforts } : {}), ...(defaultEffort ? { defaultEffort } : {}), ...(typeof value.default_enabled === "boolean" ? { defaultEnabled: value.default_enabled } : {}), ...(typeof value.mandatory === "boolean" ? { mandatory: value.mandatory } : {}) };
}

function normalizePricing(value: unknown): ModelPricing | undefined {
  if (!isRecord(value)) return undefined;
  const prompt = finiteNumber(value.prompt);
  const completion = finiteNumber(value.completion);
  if (prompt === null || completion === null) return undefined;
  return { currency: "USD", inputCacheHitPerMillion: prompt * 1_000_000, inputCacheMissPerMillion: prompt * 1_000_000, outputPerMillion: completion * 1_000_000 };
}

const REASONING_EFFORTS = new Set<ModelReasoningEffort>(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
function isReasoningEffort(value: unknown): value is ModelReasoningEffort { return typeof value === "string" && REASONING_EFFORTS.has(value as ModelReasoningEffort); }
function cleanText(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function positiveInteger(value: unknown): number | null { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function finiteNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isMissingFile(error: unknown): boolean { return isRecord(error) && error.code === "ENOENT"; }
function isCatalogCache(value: unknown): value is OpenRouterCatalogCache {
  return isRecord(value)
    && value.version === CACHE_VERSION
    && typeof value.fetchedAt === "string"
    && Number.isFinite(Date.parse(value.fetchedAt))
    && typeof value.sourceUrl === "string"
    && Array.isArray(value.models)
    && value.models.every(isCatalogModelView)
    && Number.isInteger(value.skippedCount)
    && Number(value.skippedCount) >= 0;
}

function isCatalogModelView(value: unknown): value is CatalogModelView {
  if (!isRecord(value)) return false;
  const input = value.input;
  const efforts = value.reasoningEfforts;
  return value.provider === "openrouter"
    && typeof value.apiModel === "string"
    && value.apiModel.length > 0
    && typeof value.name === "string"
    && value.name.length > 0
    && isNullablePositiveInteger(value.contextWindow)
    && isNullablePositiveInteger(value.maxTokens)
    && Array.isArray(input)
    && input.length > 0
    && input.every((item) => item === "text" || item === "image")
    && (value.toolUse === "declared" || value.toolUse === "unknown")
    && typeof value.reasoning === "boolean"
    && (efforts === undefined || efforts === null || (Array.isArray(efforts) && efforts.every(isReasoningEffort)))
    && (value.reasoningDefaultEffort === undefined || isReasoningEffort(value.reasoningDefaultEffort))
    && (value.reasoningDefaultEnabled === undefined || typeof value.reasoningDefaultEnabled === "boolean")
    && (value.reasoningMandatory === undefined || typeof value.reasoningMandatory === "boolean")
    && typeof value.isFree === "boolean"
    && (value.pricing === undefined || isModelPricing(value.pricing))
    && typeof value.added === "boolean";
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) > 0);
}

function isModelPricing(value: unknown): value is ModelPricing {
  return isRecord(value)
    && (value.currency === "USD" || value.currency === "CNY")
    && isNonNegativeNumber(value.inputCacheHitPerMillion)
    && isNonNegativeNumber(value.inputCacheMissPerMillion)
    && (value.inputCacheWritePerMillion === undefined || isNonNegativeNumber(value.inputCacheWritePerMillion))
    && isNonNegativeNumber(value.outputPerMillion)
    && (value.reasoningPerMillion === undefined || isNonNegativeNumber(value.reasoningPerMillion));
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}
