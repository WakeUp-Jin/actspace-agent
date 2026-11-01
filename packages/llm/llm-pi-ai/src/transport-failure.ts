import type { LlmFailureKind } from "@actspace/llm-service";

/**
 * Matches timeout, timed out, time-out and undici/Node codes such as UND_ERR_CONNECT_TIMEOUT or ETIMEDOUT.
 * Word boundaries keep text such as "runtime output" from being read as a timeout and retried.
 */
export const TIMEOUT_PATTERN = /\btime(?:d)?[\s-]*out\b|\bETIMEDOUT\b|_TIMEOUT\b/i;
const NETWORK_CODE = /^(?:ECONN\w*|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR_SOCKET)$/;

/** Walk the `cause` chain: SDKs wrap undici errors, and the code only survives on the inner error. */
export function transportCauseOf(error: unknown): { readonly code?: string; readonly host?: string } {
  let code: string | undefined;
  let host: string | undefined;
  let current: unknown = error;
  for (let depth = 0; depth < 6 && typeof current === "object" && current !== null; depth += 1) {
    const value = current as { readonly code?: unknown; readonly hostname?: unknown; readonly host?: unknown; readonly cause?: unknown };
    if (code === undefined && typeof value.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(value.code)) code = value.code;
    if (host === undefined) {
      const named = typeof value.hostname === "string" ? value.hostname : typeof value.host === "string" ? value.host : undefined;
      if (named !== undefined && named.length > 0) host = named;
    }
    current = value.cause;
  }
  return { ...(code === undefined ? {} : { code }), ...(host === undefined ? {} : { host }) };
}

export function endpointHost(endpoint: string | undefined): string | undefined {
  if (endpoint === undefined) return undefined;
  try { return new URL(endpoint).host || undefined; } catch { return undefined; }
}

/** Name the network problem so users can tell it from a provider error; the original text stays in brackets. */
export function describeTransportFailure(kind: LlmFailureKind, message: string, cause: { readonly code?: string; readonly host?: string }, endpoint: string | undefined): string {
  if (kind !== "timeout" && kind !== "network") return message;
  const host = cause.host ?? endpointHost(endpoint);
  const target = host ?? "服务端";
  const connecting = cause.code === "UND_ERR_CONNECT_TIMEOUT";
  const summary = kind === "timeout"
    ? connecting ? `连接 ${target} 超时（10 秒内未建立连接）` : `请求 ${target} 超时`
    : `无法连接 ${target}`;
  return `${summary}，请检查网络或中转站。原始错误：${message}`;
}

/** Classify by message and by the inner Node error code (an SDK may only say "Connection error."). */
export function transportKind(message: string, code: string | undefined): "timeout" | "network" | undefined {
  if (TIMEOUT_PATTERN.test(`${code ?? ""} ${message}`)) return "timeout";
  if (code !== undefined && NETWORK_CODE.test(code)) return "network";
  return undefined;
}
