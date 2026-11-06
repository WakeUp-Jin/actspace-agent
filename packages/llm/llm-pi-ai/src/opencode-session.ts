import { catalogProviderForEndpoint } from "@actspace/shared";

/**
 * OpenCode 用 `x-opencode-session` 把同一会话的请求路由到同一上游实例，并据此复用前缀缓存。
 * 缺这个头不会报错，但每个请求都会被当成新会话：缓存命中率归零、成本翻倍。
 * 值用 Session id，与 Journal 和请求快照里的 sessionId 一致，便于对账。
 */
export function withOpencodeSessionHeader(
  headers: Readonly<Record<string, string>> | undefined,
  baseUrl: string | undefined,
  sessionId: string | undefined,
): Readonly<Record<string, string>> | undefined {
  // 只在端点确实属于 OpenCode 时发送，避免把会话 id 交给其它服务商。
  if (!sessionId || catalogProviderForEndpoint(baseUrl ?? "") !== "opencode-go") return headers;
  return { ...headers, "x-opencode-session": sessionId };
}
