import { ProviderProxyPool } from "@actspace/llm-service";
import type {
  BalanceProviderId,
  ProviderBalanceSnapshot,
  ProviderConnectionErrorKind,
} from "@actspace/shared";

type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type ProviderNetworkRuntime = {
  readonly provider: BalanceProviderId;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly transport?: { readonly proxyUrl: string };
};

export type ProviderConnectionProbe = {
  readonly ok: boolean;
  readonly message: string;
  readonly checkedAt: string;
  readonly errorKind?: ProviderConnectionErrorKind;
  readonly statusCode?: number;
};

export type ProviderNetworkServiceOptions = {
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly directFetch?: ProviderFetch;
  readonly proxyFetch?: (proxyUrl: string) => Promise<ProviderFetch>;
};
export type ProviderCatalogFetchResult =
  | { readonly ok: true; readonly payload: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string };

const DEFAULT_TIMEOUT_MS = 10_000;

export class ProviderNetworkService {
  readonly #proxies = new ProviderProxyPool();
  readonly #timeoutMs: number;
  readonly #now: () => Date;
  readonly #directFetch: ProviderFetch;
  readonly #proxyFetch: (proxyUrl: string) => Promise<ProviderFetch>;

  constructor(options: ProviderNetworkServiceOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? (() => new Date());
    this.#directFetch = options.directFetch ?? globalThis.fetch.bind(globalThis);
    this.#proxyFetch = options.proxyFetch ?? ((url) => this.#proxies.getFetch(url));
  }

  async testConnection(runtime: ProviderNetworkRuntime): Promise<ProviderConnectionProbe> {
    const checkedAt = this.#now().toISOString();
    try {
      const response = await this.#request(runtime, connectionUrl(runtime));
      if (response.ok) return { ok: true, message: "Connection succeeded.", checkedAt };
      return statusFailure(response.status, checkedAt);
    } catch (error) {
      const errorKind = classifyNetworkFailure(error);
      const message = errorKind === "timeout"
        ? "Connection timed out."
        : errorKind === "proxy"
          ? "Provider proxy connection failed."
          : "Provider network connection failed.";
      return { ok: false, message, checkedAt, errorKind };
    }
  }

  async getBalance(provider: BalanceProviderId, runtime: ProviderNetworkRuntime | undefined): Promise<ProviderBalanceSnapshot> {
    const generatedAt = this.#now().toISOString();
    if (!runtime) return { provider, isConfigured: false, isAvailable: null, generatedAt, displayBalance: null };
    try {
      const response = await this.#request(runtime, balanceUrl(runtime));
      if (!response.ok) throw new Error(`provider_status_${response.status}`);
      const payload = await response.json() as unknown;
      return balanceSnapshot(provider, payload, generatedAt);
    } catch (error) {
      const kind = classifyNetworkFailure(error);
      if (kind === "timeout") throw new Error(`${provider} balance request timed out.`);
      if (kind === "proxy") throw new Error(`${provider} balance proxy connection failed.`);
      throw new Error(`${provider} balance request failed.`);
    }
  }

  async fetchModelCatalog(runtime: ProviderNetworkRuntime): Promise<ProviderCatalogFetchResult> {
    if (runtime.provider !== "openrouter" && runtime.provider !== "deepseek" && runtime.provider !== "kimi") return { ok: false, code: "invalid_provider", message: "This provider does not expose a supported model catalog." };
    try {
      const response = await this.#request(runtime, `${runtime.baseUrl.replace(/\/+$/, "")}/models`);
      if (!response.ok) {
        const failure = statusFailure(response.status, this.#now().toISOString());
        return { ok: false, code: failure.errorKind ?? "invalid_request", message: failure.message };
      }
      return { ok: true, payload: await response.json() as unknown };
    } catch (error) {
      const code = classifyNetworkFailure(error);
      return { ok: false, code, message: code === "timeout" ? "Model catalog request timed out." : code === "proxy" ? "Model catalog proxy connection failed." : "Model catalog network request failed." };
    }
  }

  async dispose(): Promise<void> {
    await this.#proxies.dispose();
  }

  async #request(runtime: ProviderNetworkRuntime, url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    timeout.unref?.();
    try {
      const fetchImpl = runtime.transport?.proxyUrl
        ? await this.#proxyFetch(runtime.transport.proxyUrl)
        : this.#directFetch;
      return await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${runtime.apiKey}`,
          ...(runtime.provider === "openrouter" ? { "HTTP-Referer": "https://actspace.ai", "X-Title": "ActSpace" } : {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function connectionUrl(runtime: ProviderNetworkRuntime): string {
  const base = runtime.baseUrl.replace(/\/+$/, "");
  if (runtime.provider === "deepseek") return `${base.replace(/\/anthropic$/i, "").replace(/\/v1$/i, "")}/user/balance`;
  return `${base}/models`;
}

function balanceUrl(runtime: ProviderNetworkRuntime): string {
  const base = runtime.baseUrl.replace(/\/+$/, "");
  if (runtime.provider === "deepseek") return `${base.replace(/\/anthropic$/i, "").replace(/\/v1$/i, "")}/user/balance`;
  if (runtime.provider === "kimi") return `${base.endsWith("/v1") ? base.slice(0, -3) : base}/v1/users/me/balance`;
  return `${base}/credits`;
}

function statusFailure(status: number, checkedAt: string): ProviderConnectionProbe {
  const errorKind: ProviderConnectionErrorKind = status === 401 || status === 403
    ? "auth"
    : status === 402
      ? "insufficient_balance"
      : status === 429
        ? "rate_limit"
        : status >= 500
          ? "server"
          : "invalid_request";
  return { ok: false, message: `Provider connection failed with HTTP ${status}.`, checkedAt, errorKind, statusCode: status };
}

function classifyNetworkFailure(error: unknown): Extract<ProviderConnectionErrorKind, "proxy" | "timeout" | "network"> {
  if (error instanceof Error && (error.name === "AbortError" || /timed?\s*out/i.test(error.message))) return "timeout";
  if (error instanceof Error && error.name === "ProviderProxyError") return "proxy";
  return "network";
}

function balanceSnapshot(provider: BalanceProviderId, payload: unknown, generatedAt: string): ProviderBalanceSnapshot {
  const record = isRecord(payload) ? payload : {};
  if (provider === "deepseek") {
    const rows = Array.isArray(record.balance_infos) ? record.balance_infos.filter(isRecord) : [];
    const selected = rows.find((row) => row.currency === "CNY") ?? rows[0];
    return { provider, isConfigured: true, isAvailable: typeof record.is_available === "boolean" ? record.is_available : null, generatedAt, displayBalance: selected ? amount(String(selected.total_balance ?? ""), String(selected.currency ?? "").toUpperCase()) : null };
  }
  if (provider === "kimi") {
    const data = isRecord(record.data) ? record.data : {};
    return { provider, isConfigured: true, isAvailable: typeof record.status === "boolean" ? record.status : null, generatedAt, displayBalance: amount(String(data.available_balance ?? ""), "CNY") };
  }
  const data = isRecord(record.data) ? record.data : {};
  const total = Number(data.total_credits);
  const used = Number(data.total_usage);
  return { provider, isConfigured: true, isAvailable: true, generatedAt, displayBalance: Number.isFinite(total) && Number.isFinite(used) ? amount(String(Math.max(0, total - used)), "USD") : null };
}

function amount(raw: string, currency: string): ProviderBalanceSnapshot["displayBalance"] {
  const numeric = Number(raw.trim());
  if (!Number.isFinite(numeric) || !currency) return null;
  return { amount: numeric.toFixed(2), currency };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
