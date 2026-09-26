import { ProviderProxyPool } from "@actspace/llm-service";
import { customConnectionRequestUrl } from "@actspace/shared";
import type {
  BalanceProviderId,
  CustomConnectionAuthMode,
  CustomConnectionProbeResult,
  CustomConnectionResolvedAuth,
  CustomConnectionTestResult,
  ModelApi,
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
export type CustomConnectionProbeRuntime = {
  readonly protocol: ModelApi;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly transport?: { readonly proxyUrl: string };
  /** 只对 Anthropic 协议生效；缺省按 x-api-key。 */
  readonly authMode?: CustomConnectionAuthMode;
  /** auto 模式下已经确认能用的认证方式；有值时不再回退。 */
  readonly resolvedAuth?: CustomConnectionResolvedAuth;
};

const MODEL_LIST_MAX_PAGES = 5;

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

  /** 发 1 Token 的真实请求。auto 模式还没识别过认证方式时，x-api-key 被拒就改用 Bearer 再试一次。 */
  async testCustomConnection(runtime: CustomConnectionProbeRuntime): Promise<CustomConnectionTestResult> {
    const checkedAt = this.#now().toISOString();
    try {
      const fetchImpl = await this.#customFetch(runtime);
      let failure: CustomConnectionTestResult | undefined;
      for (const scheme of authAttempts(runtime)) {
        const response = await this.#withTimeout((signal) => fetchImpl(customConnectionRequestUrl(runtime.baseUrl, runtime.protocol), {
          method: "POST",
          headers: { ...customConnectionHeaders(runtime, scheme), "Content-Type": "application/json" },
          body: JSON.stringify(customConnectionBody(runtime)),
          signal,
        }));
        if (response.ok) return { ok: true, message: "模型测试成功。", checkedAt, ...resolvedAuthField(runtime, scheme) };
        failure = customStatusFailure(response.status, checkedAt);
        if (failure.errorKind !== "auth") break;
      }
      return failure!;
    } catch (error) {
      return customNetworkFailure(error, checkedAt, "模型测试");
    }
  }

  /**
   * 读取服务的模型列表，顺带确认地址、Key 和认证方式。
   * 404/405/501 视为服务没有提供列表：只能证明地址可达，不写 resolvedAuth。
   */
  async probeCustomConnection(runtime: CustomConnectionProbeRuntime): Promise<CustomConnectionProbeResult> {
    const checkedAt = this.#now().toISOString();
    try {
      const fetchImpl = await this.#customFetch(runtime);
      let failure: CustomConnectionProbeResult | undefined;
      for (const scheme of authAttempts(runtime)) {
        const listed = await this.#listModels(fetchImpl, runtime, scheme);
        if ("models" in listed) {
          return { ok: true, message: `连接成功 · ${listed.models.length} 个模型。`, checkedAt, models: listed.models, ...resolvedAuthField(runtime, scheme) };
        }
        if (listed.status === 404 || listed.status === 405 || listed.status === 501) {
          return { ok: true, message: "已连通 · 服务未提供模型列表。", checkedAt, statusCode: listed.status, models: null };
        }
        failure = { ...customStatusFailure(listed.status, checkedAt), models: null };
        if (failure.errorKind !== "auth") break;
      }
      return failure!;
    } catch (error) {
      return { ...customNetworkFailure(error, checkedAt, "连接测试"), models: null };
    }
  }

  async #listModels(fetchImpl: ProviderFetch, runtime: CustomConnectionProbeRuntime, scheme: CustomConnectionResolvedAuth): Promise<{ readonly models: { id: string; label?: string }[] } | { readonly status: number }> {
    const base = runtime.baseUrl.replace(/\/+$/, "");
    const anthropic = runtime.protocol === "anthropic-messages";
    const models = new Map<string, { id: string; label?: string }>();
    let afterId: string | undefined;
    for (let page = 0; page < (anthropic ? MODEL_LIST_MAX_PAGES : 1); page += 1) {
      const url = anthropic
        ? `${base}/v1/models?limit=1000${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ""}`
        : `${base}/models`;
      const response = await this.#withTimeout((signal) => fetchImpl(url, { method: "GET", headers: customConnectionHeaders(runtime, scheme), signal }));
      if (!response.ok) {
        // 后续页失败时保留已经拿到的部分，不让整次探测失败。
        if (page > 0) break;
        return { status: response.status };
      }
      const payload = await response.json().catch(() => null) as unknown;
      const rows = isRecord(payload) && Array.isArray(payload.data) ? payload.data.filter(isRecord) : [];
      for (const row of rows) {
        if (typeof row.id !== "string" || !row.id.trim() || models.has(row.id)) continue;
        const label = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : undefined;
        models.set(row.id, { id: row.id, ...(label ? { label } : {}) });
      }
      const lastId = isRecord(payload) && typeof payload.last_id === "string" ? payload.last_id : undefined;
      if (!anthropic || !isRecord(payload) || payload.has_more !== true || !lastId) break;
      afterId = lastId;
    }
    return { models: [...models.values()] };
  }

  async #customFetch(runtime: CustomConnectionProbeRuntime): Promise<ProviderFetch> {
    return runtime.transport?.proxyUrl ? await this.#proxyFetch(runtime.transport.proxyUrl) : this.#directFetch;
  }

  async #withTimeout(request: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    timeout.unref?.();
    try {
      return await request(controller.signal);
    } finally {
      clearTimeout(timeout);
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

function authAttempts(runtime: CustomConnectionProbeRuntime): readonly CustomConnectionResolvedAuth[] {
  if (runtime.protocol !== "anthropic-messages") return ["bearer"];
  if (runtime.authMode === "bearer") return ["bearer"];
  if (runtime.authMode === "auto") return runtime.resolvedAuth ? [runtime.resolvedAuth] : ["x-api-key", "bearer"];
  return ["x-api-key"];
}

function resolvedAuthField(runtime: CustomConnectionProbeRuntime, scheme: CustomConnectionResolvedAuth): { resolvedAuth?: CustomConnectionResolvedAuth } {
  return runtime.protocol === "anthropic-messages" && runtime.authMode === "auto" ? { resolvedAuth: scheme } : {};
}

/** 两种认证方式互斥：走 Bearer 时不能同时带 x-api-key，否则部分中转站会按 x-api-key 校验失败。 */
function customConnectionHeaders(runtime: CustomConnectionProbeRuntime, scheme: CustomConnectionResolvedAuth): Record<string, string> {
  const auth = scheme === "bearer" ? { Authorization: `Bearer ${runtime.apiKey}` } : { "x-api-key": runtime.apiKey };
  return { Accept: "application/json", ...auth, ...(runtime.protocol === "anthropic-messages" ? { "anthropic-version": "2023-06-01" } : {}) };
}

/** 面向自定义连接的中文结果；不包含 Key 或响应正文。 */
function customStatusFailure(status: number, checkedAt: string): CustomConnectionTestResult {
  const { errorKind } = statusFailure(status, checkedAt);
  const reason = errorKind === "auth" ? "API Key 无效，或认证方式不被接受"
    : errorKind === "insufficient_balance" ? "账户余额不足"
      : errorKind === "rate_limit" ? "请求过于频繁"
        : errorKind === "server" ? "服务端出错"
          : status === 404 ? "接口地址或模型不存在，请检查服务地址和协议"
            : "请求被拒绝";
  return { ok: false, message: `${reason}（HTTP ${status}）。`, checkedAt, errorKind, statusCode: status };
}

function customNetworkFailure(error: unknown, checkedAt: string, action: string): CustomConnectionTestResult {
  const errorKind = classifyNetworkFailure(error);
  return { ok: false, checkedAt, errorKind, message: errorKind === "timeout" ? `${action}超时。` : errorKind === "proxy" ? "代理连接失败。" : "网络请求失败，请检查服务地址。" };
}

function customConnectionBody(runtime: CustomConnectionProbeRuntime): Record<string, unknown> {
  if (runtime.protocol === "openai-responses") return { model: runtime.model, input: "Reply with OK.", max_output_tokens: 1 };
  return { model: runtime.model, max_tokens: 1, messages: [{ role: "user", content: "Reply with OK." }] };
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
