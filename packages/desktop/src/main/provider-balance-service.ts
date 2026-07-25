import {
  createProviderFetch,
  isProviderProxyError,
  type ProviderFetch,
  type ProviderRuntimeConfig,
} from "@actspace/agent-core";
import type {
  BalanceProviderId,
  DeepSeekBalanceSnapshot,
  KimiBalanceSnapshot,
  OpenRouterBalanceSnapshot,
  ProviderBalanceSnapshot,
} from "@actspace/shared";

const DEFAULT_TIMEOUT_MS = 8_000;

export interface ProviderBalanceServiceOptions {
  timeoutMs?: number;
  directFetch?: ProviderFetch;
  createFetch?: (proxyUrl?: string) => ProviderFetch | undefined;
  now?: () => Date;
}

type DeepSeekBalanceApiInfo = {
  currency?: unknown;
  total_balance?: unknown;
};

type DeepSeekBalanceApiResponse = {
  is_available?: unknown;
  balance_infos?: unknown;
};

type MoonshotBalanceData = {
  available_balance?: unknown;
};

type MoonshotBalanceApiResponse = {
  status?: unknown;
  data?: unknown;
};

type OpenRouterCreditsData = {
  total_credits?: unknown;
  total_usage?: unknown;
};

type OpenRouterCreditsApiResponse = {
  data?: unknown;
};

function normalizeBalanceAmount(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return numeric.toFixed(2);
}

function resolveDeepSeekBalanceUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  const apiRoot = normalized
    .replace(/\/anthropic$/i, "")
    .replace(/\/v1$/i, "");
  return `${apiRoot}/user/balance`;
}

function selectDeepSeekDisplayBalance(response: DeepSeekBalanceApiResponse): DeepSeekBalanceSnapshot["displayBalance"] {
  if (!Array.isArray(response.balance_infos)) return null;
  const infos = response.balance_infos.filter((item): item is DeepSeekBalanceApiInfo => item !== null && typeof item === "object");
  const preferred = infos.find((info) => info.currency === "CNY") ?? infos[0];
  if (!preferred || typeof preferred.currency !== "string") return null;
  const amount = normalizeBalanceAmount(preferred.total_balance);
  return amount ? { amount, currency: preferred.currency.toUpperCase() } : null;
}

function resolveKimiBalanceUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  const root = normalized.endsWith("/v1") ? normalized.slice(0, -3) : normalized;
  return `${root}/v1/users/me/balance`;
}

function selectKimiDisplayBalance(payload: MoonshotBalanceApiResponse): KimiBalanceSnapshot["displayBalance"] {
  if (payload.data === null || typeof payload.data !== "object") return null;
  const amount = normalizeBalanceAmount((payload.data as MoonshotBalanceData).available_balance);
  return amount ? { amount, currency: "CNY" } : null;
}

function resolveOpenRouterCreditsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/credits`;
}

function selectOpenRouterDisplayBalance(payload: OpenRouterCreditsApiResponse): OpenRouterBalanceSnapshot["displayBalance"] {
  if (payload.data === null || typeof payload.data !== "object") return null;
  const data = payload.data as OpenRouterCreditsData;
  const totalCredits = Number(data.total_credits);
  const totalUsage = Number(data.total_usage);
  if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) return null;
  const amount = normalizeBalanceAmount(Math.max(0, totalCredits - totalUsage));
  return amount ? { amount, currency: "USD" } : null;
}

function unconfiguredSnapshot(provider: "deepseek", generatedAt: string): DeepSeekBalanceSnapshot;
function unconfiguredSnapshot(provider: "kimi", generatedAt: string): KimiBalanceSnapshot;
function unconfiguredSnapshot(provider: "openrouter", generatedAt: string): OpenRouterBalanceSnapshot;
function unconfiguredSnapshot(provider: BalanceProviderId, generatedAt: string): ProviderBalanceSnapshot {
  return { provider, isConfigured: false, isAvailable: null, generatedAt, displayBalance: null };
}

async function requestBalance(
  runtime: ProviderRuntimeConfig,
  url: string,
  options: ProviderBalanceServiceOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const fetchImpl = (options.createFetch ?? createProviderFetch)(runtime.transport?.proxyUrl)
      ?? options.directFetch
      ?? globalThis.fetch.bind(globalThis);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${runtime.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`provider balance request failed with status ${response.status}`);
    return response;
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error(`${runtime.provider} balance request timed out.`);
    }
    if (isProviderProxyError(error)) throw new Error(`${runtime.provider} balance proxy connection failed.`);
    if (error instanceof Error && /status \d+$/.test(error.message)) throw error;
    throw new Error(`${runtime.provider} balance request failed.`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDeepSeekBalanceSnapshot(
  runtime: ProviderRuntimeConfig | undefined,
  options: ProviderBalanceServiceOptions = {},
): Promise<DeepSeekBalanceSnapshot> {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  if (!runtime) return unconfiguredSnapshot("deepseek", generatedAt);
  if (runtime.provider !== "deepseek") throw new Error("DeepSeek balance requires a DeepSeek runtime.");
  const response = await requestBalance(runtime, resolveDeepSeekBalanceUrl(runtime.baseUrl), options);
  const payload = await response.json() as DeepSeekBalanceApiResponse;
  return {
    provider: "deepseek",
    isConfigured: true,
    isAvailable: typeof payload.is_available === "boolean" ? payload.is_available : null,
    generatedAt,
    displayBalance: selectDeepSeekDisplayBalance(payload),
  };
}

export async function getKimiBalanceSnapshot(
  runtime: ProviderRuntimeConfig | undefined,
  options: ProviderBalanceServiceOptions = {},
): Promise<KimiBalanceSnapshot> {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  if (!runtime) return unconfiguredSnapshot("kimi", generatedAt);
  if (runtime.provider !== "kimi") throw new Error("Kimi balance requires a Kimi runtime.");
  const response = await requestBalance(runtime, resolveKimiBalanceUrl(runtime.baseUrl), options);
  const payload = await response.json() as MoonshotBalanceApiResponse;
  return {
    provider: "kimi",
    isConfigured: true,
    isAvailable: typeof payload.status === "boolean" ? payload.status : null,
    generatedAt,
    displayBalance: selectKimiDisplayBalance(payload),
  };
}

export async function getOpenRouterBalanceSnapshot(
  runtime: ProviderRuntimeConfig | undefined,
  options: ProviderBalanceServiceOptions = {},
): Promise<OpenRouterBalanceSnapshot> {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  if (!runtime) return unconfiguredSnapshot("openrouter", generatedAt);
  if (runtime.provider !== "openrouter") throw new Error("OpenRouter balance requires an OpenRouter runtime.");
  const response = await requestBalance(runtime, resolveOpenRouterCreditsUrl(runtime.baseUrl), options);
  const payload = await response.json() as OpenRouterCreditsApiResponse;
  return {
    provider: "openrouter",
    isConfigured: true,
    isAvailable: true,
    generatedAt,
    displayBalance: selectOpenRouterDisplayBalance(payload),
  };
}

export async function getProviderBalanceSnapshot(
  provider: BalanceProviderId,
  runtime: ProviderRuntimeConfig | undefined,
  options: ProviderBalanceServiceOptions = {},
): Promise<ProviderBalanceSnapshot> {
  switch (provider) {
    case "deepseek":
      return getDeepSeekBalanceSnapshot(runtime, options);
    case "kimi":
      return getKimiBalanceSnapshot(runtime, options);
    case "openrouter":
      return getOpenRouterBalanceSnapshot(runtime, options);
    default: {
      const exhaustiveProvider: never = provider;
      throw new Error(`Unsupported balance provider: ${exhaustiveProvider}`);
    }
  }
}
