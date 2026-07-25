import {
  createProviderFetch,
  isProviderProxyError,
  providerDefaultHeaders,
  type ProviderFetch,
  type ProviderRuntimeConfig,
} from "@actspace/agent-core";
import type { ProviderConnectionErrorKind } from "@actspace/shared";

export interface ProviderConnectionProbeResult {
  ok: boolean;
  message: string;
  checkedAt: string;
  errorKind?: ProviderConnectionErrorKind;
  statusCode?: number;
}

export interface ProviderConnectionServiceOptions {
  timeoutMs?: number;
  directFetch?: ProviderFetch;
  createFetch?: (proxyUrl?: string) => ProviderFetch | undefined;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function resolveProbeUrl(runtime: ProviderRuntimeConfig): string {
  const normalized = runtime.baseUrl.replace(/\/+$/, "");
  if (runtime.provider === "deepseek") {
    const apiRoot = normalized
      .replace(/\/anthropic$/i, "")
      .replace(/\/v1$/i, "");
    return `${apiRoot}/user/balance`;
  }
  return `${normalized}/models`;
}

function statusError(status: number, checkedAt: string): ProviderConnectionProbeResult {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      message: "鉴权失败：API Key 无效或权限不足。",
      checkedAt,
      errorKind: "auth",
      statusCode: status,
    };
  }
  if (status === 402) {
    return {
      ok: false,
      message: "余额不足或当前账户无权使用该服务。",
      checkedAt,
      errorKind: "insufficient_balance",
      statusCode: status,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      message: "请求过于频繁，请稍后重试。",
      checkedAt,
      errorKind: "rate_limit",
      statusCode: status,
    };
  }
  if (status >= 500) {
    return {
      ok: false,
      message: "供应商服务暂时不可用，请稍后重试。",
      checkedAt,
      errorKind: "server",
      statusCode: status,
    };
  }
  return {
    ok: false,
    message: `连接失败：服务返回状态码 ${status}。`,
    checkedAt,
    errorKind: "invalid_request",
    statusCode: status,
  };
}

/** Lightweight provider health check. It never sends a prompt or exposes response bodies. */
export async function testProviderConnection(
  runtime: ProviderRuntimeConfig,
  options: ProviderConnectionServiceOptions = {},
): Promise<ProviderConnectionProbeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const createFetch = options.createFetch ?? createProviderFetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchImpl = createFetch(runtime.transport?.proxyUrl)
      ?? options.directFetch
      ?? globalThis.fetch.bind(globalThis);
    const response = await fetchImpl(resolveProbeUrl(runtime), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${runtime.apiKey}`,
        ...providerDefaultHeaders(runtime.provider),
      },
      signal: controller.signal,
    });
    if (response.ok) {
      return { ok: true, message: "连接成功，API Key 有效。", checkedAt };
    }
    return statusError(response.status, checkedAt);
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return {
        ok: false,
        message: "连接超时，请检查网络或代理配置。",
        checkedAt,
        errorKind: "timeout",
      };
    }
    if (isProviderProxyError(error)) {
      return {
        ok: false,
        message: "代理连接失败，请检查该服务商的代理设置。",
        checkedAt,
        errorKind: "proxy",
      };
    }
    return {
      ok: false,
      message: "连接失败，请检查网络后重试。",
      checkedAt,
      errorKind: "network",
    };
  } finally {
    clearTimeout(timeout);
  }
}
