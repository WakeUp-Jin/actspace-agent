/** `plugins.list`: rows for the 扩展 › 插件 page, derived from the plugin catalog, the startup switches and settings. */
import type { BrowserWindow } from "electron";
import type { PluginCatalogEntry } from "@actspace/runtime";
import type { PluginListItem } from "@actspace/shared";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { createIpcRegistrar } from "../ipc/registry";
import { resolvePluginSwitches, type PluginSwitchSettings } from "./plugin-switches";

/** Host rows that exist only in one application form; the desktop form lists just its own. */
const FORM_ONLY_HOST_ENTRIES: Readonly<Record<string, "desktop" | "host" | "headless">> = Object.freeze({
  "desktop-app": "desktop",
  "agent-host": "host",
  "headless-runner": "headless",
});

export type PluginListCatalogEntry = Pick<PluginCatalogEntry, "id" | "loaders" | "directory"> & { readonly manifest: { readonly display?: NonNullable<PluginCatalogEntry["manifest"]["display"]> } };

export function listPluginItems(input: {
  readonly catalog: readonly PluginListCatalogEntry[];
  readonly startupSwitches: ReadonlyMap<string, boolean>;
  readonly settings: PluginSwitchSettings;
  readonly form?: "desktop" | "host" | "headless";
}): PluginListItem[] {
  const form = input.form ?? "desktop";
  const current = resolvePluginSwitches(input.settings, input.catalog);
  const seen = new Set<string>();
  const items: PluginListItem[] = [];
  for (const entry of input.catalog) {
    const display = entry.manifest.display;
    if (display === undefined || seen.has(entry.id)) continue;
    const onlyIn = FORM_ONLY_HOST_ENTRIES[entry.id];
    if (onlyIn !== undefined && onlyIn !== form) continue;
    seen.add(entry.id);
    items.push({
      id: entry.id,
      title: display.title,
      description: display.description,
      // llm-service is mounted on the Host and in every Harness; it is listed once, as a global plugin.
      scope: entry.loaders.includes("host") ? "global" : display.scope,
      directory: entry.directory,
      canDisable: display.canDisable,
      loaded: display.canDisable ? input.startupSwitches.get(entry.id) ?? true : true,
      enabled: current.get(entry.id) ?? true,
    });
  }
  return items;
}

export function registerPluginsIpc(options: {
  readonly getMainWindow: () => BrowserWindow | undefined;
  readonly catalog: readonly PluginListCatalogEntry[];
  readonly startupSwitches: ReadonlyMap<string, boolean>;
  readonly settings: { getV4(): { readonly settings: PluginSwitchSettings } };
}): () => void {
  const ipc = createIpcRegistrar({ getWindow: () => options.getMainWindow() ?? null, untrustedMessage: "无效的插件列表请求来源。" });
  // Settings are read on every call so `enabled` follows the latest switch; `loaded` stays at the startup value.
  ipc.handle(contract.plugins.list, () => listPluginItems({ catalog: options.catalog, startupSwitches: options.startupSwitches, settings: options.settings.getV4().settings }));
  return () => ipc.dispose();
}
