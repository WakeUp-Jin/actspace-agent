import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createProviderFetch,
  isProviderProxyError,
  providerDefaultHeaders,
  type ProviderFetch,
  type ProviderRuntimeConfig,
} from "@actspace/agent-core";
import type {
  CatalogCacheState,
  CatalogModelView,
  OpenRouterCatalogCache,
} from "@actspace/shared";

const CACHE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1_000;

export interface CatalogServiceResult {
  state: CatalogCacheState;
  fetchedAt?: string;
  stale: boolean;
  models: CatalogModelView[];
  skippedCount: number;
  error?: { code: string; message: string };
}

export interface OpenRouterCatalogServiceOptions {
  dataRoot: string;
  timeoutMs?: number;
  staleAfterMs?: number;
  now?: () => Date;
  directFetch?: ProviderFetch;
  createFetch?: (proxyUrl?: string) => ProviderFetch | undefined;
  isAdded?: (apiModel: string) => boolean;
  /** Test seam for deterministic cache write failures; production uses temp file + rename. */
  writeJson?: (filePath: string, value: unknown) => Promise<void>;
}

export class OpenRouterCatalogService {
  private readonly cachePath: string;
  private readonly timeoutMs: number;
  private readonly staleAfterMs: number;
  private readonly now: () => Date;
  private readonly directFetch?: ProviderFetch;
  private readonly createFetch: (proxyUrl?: string) => ProviderFetch | undefined;
  private readonly isAdded: (apiModel: string) => boolean;
  private readonly writeJson: (filePath: string, value: unknown) => Promise<void>;
  private cache: OpenRouterCatalogCache | null = null;

  constructor(options: OpenRouterCatalogServiceOptions) {
    this.cachePath = join(options.dataRoot, "providers", "openrouter", "models-cache.json");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.now = options.now ?? (() => new Date());
    this.directFetch = options.directFetch;
    this.createFetch = options.createFetch ?? createProviderFetch;
    this.isAdded = options.isAdded ?? (() => false);
    this.writeJson = options.writeJson ?? writeJsonAtomic;
  }

  async load(): Promise<CatalogServiceResult> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isCatalogCache(parsed)) throw new Error("invalid cache schema");
      this.cache = parsed;
      return this.view();
    } catch (error) {
      if (isMissingFile(error)) {
        this.cache = null;
        return this.view();
      }
      await this.moveCorruptCacheBestEffort();
      this.cache = null;
      return {
        ...this.view(),
        error: { code: "cache_corrupt", message: "模型目录缓存损坏，已隔离并等待重新加载。" },
      };
    }
  }

  list(query = ""): CatalogServiceResult {
    const result = this.view();
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return result;
    return {
      ...result,
      models: result.models.filter((model) =>
        model.name.toLocaleLowerCase().includes(normalized) ||
        model.apiModel.toLocaleLowerCase().includes(normalized)),
    };
  }

  findModel(apiModel: string): CatalogModelView | undefined {
    return this.cache?.models.find((model) => model.apiModel === apiModel);
  }

  async reload(runtime: ProviderRuntimeConfig): Promise<CatalogServiceResult> {
    if (runtime.provider !== "openrouter") {
      return { ...this.view("offline"), error: { code: "invalid_provider", message: "仅支持 OpenRouter 目录。" } };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const fetchImpl = this.createFetch(runtime.transport?.proxyUrl)
        ?? this.directFetch
        ?? globalThis.fetch.bind(globalThis);
      const sourceUrl = resolveModelsUrl(runtime.baseUrl);
      const response = await fetchImpl(sourceUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${runtime.apiKey}`,
          ...providerDefaultHeaders("openrouter"),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        return this.failureForStatus(response.status);
      }
      const payload = await response.json() as unknown;
      const normalized = normalizeCatalogPayload(payload);
      const fetchedAt = this.now().toISOString();
      const cache: OpenRouterCatalogCache = {
        version: CACHE_VERSION,
        fetchedAt,
        sourceUrl,
        models: normalized.models,
        skippedCount: normalized.skippedCount,
      };
      try {
        await this.writeJson(this.cachePath, cache);
      } catch {
        return {
          ...this.view(this.cache ? "offline" : "missing"),
          error: { code: "cache_write", message: "模型目录已加载，但缓存写入失败；请检查磁盘权限后重试。" },
        };
      }
      this.cache = cache;
      return this.view();
    } catch (error) {
      const code = controller.signal.aborted || (error instanceof Error && error.name === "AbortError")
        ? "timeout"
        : isProviderProxyError(error)
          ? "proxy"
          : "network";
      const message = code === "timeout"
        ? "模型目录加载超时。"
        : code === "proxy"
          ? "代理连接失败，已保留上次模型目录。"
          : "模型目录加载失败，已保留上次缓存。";
      return { ...this.view(this.cache ? "offline" : "missing"), error: { code, message } };
    } finally {
      clearTimeout(timeout);
    }
  }

  private view(forceState?: CatalogCacheState): CatalogServiceResult {
    if (!this.cache) {
      return { state: forceState ?? "missing", stale: false, models: [], skippedCount: 0 };
    }
    const stale = this.now().getTime() - new Date(this.cache.fetchedAt).getTime() > this.staleAfterMs;
    return {
      state: forceState ?? (stale ? "stale" : "fresh"),
      fetchedAt: this.cache.fetchedAt,
      stale,
      models: this.cache.models.map((model) => ({ ...model, input: [...model.input], added: this.isAdded(model.apiModel) })),
      skippedCount: this.cache.skippedCount,
    };
  }

  private failureForStatus(status: number): CatalogServiceResult {
    const code = status === 401 || status === 403
      ? "auth"
      : status === 402
        ? "insufficient_balance"
        : status === 429
          ? "rate_limit"
          : status >= 500
            ? "server"
            : "invalid_request";
    return {
      ...this.view(this.cache ? "offline" : "missing"),
      error: { code, message: `模型目录加载失败（HTTP ${status}）。` },
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

function normalizeCatalogPayload(value: unknown): { models: CatalogModelView[]; skippedCount: number } {
  const rows = isRecord(value) && Array.isArray(value.data) ? value.data : [];
  const models: CatalogModelView[] = [];
  let skippedCount = 0;
  for (const row of rows) {
    const model = normalizeCatalogModel(row);
    if (model) models.push(model);
    else skippedCount += 1;
  }
  return { models, skippedCount };
}

function normalizeCatalogModel(value: unknown): CatalogModelView | undefined {
  if (!isRecord(value)) return undefined;
  const apiModel = cleanText(value.id, 300);
  if (!apiModel) return undefined;
  const name = cleanText(value.name, 180) || apiModel;
  const architecture = isRecord(value.architecture) ? value.architecture : {};
  const modalities = Array.isArray(architecture.input_modalities) ? architecture.input_modalities : [];
  const input: Array<"text" | "image"> = [];
  if (modalities.includes("text")) input.push("text");
  if (modalities.includes("image")) input.push("image");
  if (input.length === 0) input.push("text");
  const supported = Array.isArray(value.supported_parameters) ? value.supported_parameters : [];
  const pricing = normalizePricing(value.pricing);
  const prompt = readFiniteNumber(isRecord(value.pricing) ? value.pricing.prompt : undefined);
  const completion = readFiniteNumber(isRecord(value.pricing) ? value.pricing.completion : undefined);
  const topProvider = isRecord(value.top_provider) ? value.top_provider : {};
  return {
    provider: "openrouter",
    apiModel,
    name,
    contextWindow: readPositiveInteger(value.context_length),
    maxTokens: readPositiveInteger(topProvider.max_completion_tokens),
    input,
    toolUse: supported.includes("tools") || supported.includes("tool_choice") ? "declared" : "unknown",
    reasoning: supported.includes("reasoning") || supported.includes("include_reasoning"),
    isFree: prompt === 0 && completion === 0,
    ...(pricing && { pricing }),
    added: false,
  };
}

function normalizePricing(value: unknown): CatalogModelView["pricing"] | undefined {
  if (!isRecord(value)) return undefined;
  const prompt = readFiniteNumber(value.prompt);
  const completion = readFiniteNumber(value.completion);
  if (prompt === undefined || completion === undefined || prompt < 0 || completion < 0) return undefined;
  const cacheRead = readFiniteNumber(value.input_cache_read);
  return {
    currency: "USD",
    inputCacheHitPerMillion: roundPrice((cacheRead ?? prompt) * 1_000_000),
    inputCacheMissPerMillion: roundPrice(prompt * 1_000_000),
    outputPerMillion: roundPrice(completion * 1_000_000),
  };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function resolveModelsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/models") ? normalized : `${normalized}/models`;
}

function readFiniteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function readPositiveInteger(value: unknown): number | null {
  const number = readFiniteNumber(value);
  return number !== undefined && number > 0 ? Math.floor(number) : null;
}

function isCatalogCache(value: unknown): value is OpenRouterCatalogCache {
  return isRecord(value) && value.version === CACHE_VERSION && typeof value.fetchedAt === "string" &&
    typeof value.sourceUrl === "string" && Array.isArray(value.models) && typeof value.skippedCount === "number";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, filePath);
}
