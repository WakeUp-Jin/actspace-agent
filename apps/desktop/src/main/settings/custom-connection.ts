/** 连接的认证方式推导和缓存模式规范化。 */
import type {
  CustomConnectionAuthMode,
  CustomConnectionPromptCacheMode,
  CustomConnectionResolvedAuth,
  ModelApi,
  SettingsV4ConnectionSettings,
} from "@actspace/shared";

export function resolvePromptCacheMode(protocol: ModelApi, value?: CustomConnectionPromptCacheMode): CustomConnectionPromptCacheMode {
  if (protocol !== "anthropic-messages") return "off";
  return value === "off" ? "off" : "short";
}

export function isCustomConnectionAuthMode(value: unknown): value is CustomConnectionAuthMode {
  return value === "auto" || value === "x-api-key" || value === "bearer";
}

export function isResolvedAuth(value: unknown): value is CustomConnectionResolvedAuth {
  return value === "x-api-key" || value === "bearer";
}

export function resolveAuthScheme(connection: SettingsV4ConnectionSettings): CustomConnectionResolvedAuth {
  if (connection.authMode === "bearer") return "bearer";
  if (connection.authMode === "auto") return connection.resolvedAuth ?? "x-api-key";
  return "x-api-key";
}
