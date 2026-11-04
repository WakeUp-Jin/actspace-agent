/**
 * Plugin switches resolved once at startup. The values are the process's "startup switches": what is loaded
 * for the whole run. Changing the setting later only changes `enabled` on the plugin page and takes effect
 * after a restart.
 */
import type { PluginCatalogEntry } from "@actspace/runtime";
import { DEFAULT_EXTERNAL_SUBAGENT_SETTINGS, sanitizeExternalSubagentSettings, type ExternalSubagentSettings } from "@actspace/shared";

export type PluginSwitchCatalogEntry = Pick<PluginCatalogEntry, "id" | "loaders"> & { readonly manifest: { readonly display?: Pick<NonNullable<PluginCatalogEntry["manifest"]["display"]>, "defaultEnabled" | "canDisable"> } };
export type PluginSwitchSettings = { readonly tools: { readonly plugins?: Readonly<Record<string, boolean>>; readonly externalSubagents?: ExternalSubagentSettings } };

/** Plugin Entry id -> on/off. Plugins that cannot be disabled are always on and ignore the setting. */
export function resolvePluginSwitches(settings: PluginSwitchSettings, catalog: readonly PluginSwitchCatalogEntry[]): ReadonlyMap<string, boolean> {
  const switches = new Map<string, boolean>();
  for (const entry of catalog) {
    if (switches.has(entry.id)) continue;
    const display = entry.manifest.display;
    switches.set(entry.id, display?.canDisable === true ? settings.tools.plugins?.[entry.id] ?? display.defaultEnabled : true);
  }
  return switches;
}

export function disabledPluginIds(switches: ReadonlyMap<string, boolean>): readonly string[] {
  return [...switches].filter(([, enabled]) => !enabled).map(([id]) => id);
}

export const BROWSER_PLUGIN_ID = "browser-tools";
export const ENGLISH_LEARNING_PLUGIN_ID = "english-learning";

export const CODEX_PLUGIN_ID = "subagent-codex";
export const CLAUDE_CODE_PLUGIN_ID = "subagent-claude-code";

/** Plugin Entry id -> setting name -> effective value (defaults filled in; unknown stored values fall back to the default). */
export type PluginSettingValues = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * The settings of plugins that have them. They become `pluginConfig` at boot (merged over the manifest `config`,
 * see `bootProfileRuntime`), so they are fixed for the process like the switches: a change applies after a restart.
 */
export function resolvePluginSettings(settings: PluginSwitchSettings): PluginSettingValues {
  const stored = sanitizeExternalSubagentSettings(settings.tools.externalSubagents);
  return Object.freeze({
    [CODEX_PLUGIN_ID]: Object.freeze({
      approvalPolicy: stored?.codex?.approvalPolicy ?? DEFAULT_EXTERNAL_SUBAGENT_SETTINGS.codex.approvalPolicy,
      sandbox: stored?.codex?.sandbox ?? DEFAULT_EXTERNAL_SUBAGENT_SETTINGS.codex.sandbox,
    }),
    [CLAUDE_CODE_PLUGIN_ID]: Object.freeze({
      permissionMode: stored?.claudeCode?.permissionMode ?? DEFAULT_EXTERNAL_SUBAGENT_SETTINGS.claudeCode.permissionMode,
    }),
  });
}
