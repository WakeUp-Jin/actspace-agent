/**
 * Plugin switches resolved once at startup. The values are the process's "startup switches": what is loaded
 * for the whole run. Changing the setting later only changes `enabled` on the plugin page and takes effect
 * after a restart.
 */
import type { PluginCatalogEntry } from "@actspace/runtime";

export type PluginSwitchCatalogEntry = Pick<PluginCatalogEntry, "id" | "loaders"> & { readonly manifest: { readonly display?: Pick<NonNullable<PluginCatalogEntry["manifest"]["display"]>, "defaultEnabled" | "canDisable"> } };
export type PluginSwitchSettings = { readonly tools: { readonly plugins?: Readonly<Record<string, boolean>> } };

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
