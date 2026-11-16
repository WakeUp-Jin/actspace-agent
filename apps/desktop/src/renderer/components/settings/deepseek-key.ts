import type { AppSettings } from "@actspace/shared";

/** DeepSeek counts as connected when either the search key or the model provider key is saved. */
export function hasDeepseekKey(settings: Pick<AppSettings, "searchProviders" | "providers">): boolean {
  return settings.searchProviders.deepseek?.hasApiKey === true || settings.providers.deepseek.hasApiKey;
}
