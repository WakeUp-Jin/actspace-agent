/** `plugins.list`: rows for the 扩展 › 插件 page, derived from the plugin catalog, the startup switches and settings. */
import type { BrowserWindow } from "electron";
import type { PluginCatalogEntry } from "@actspace/runtime";
import type { PluginListItem } from "@actspace/shared";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { createIpcRegistrar } from "../ipc/registry";
import { CLAUDE_CODE_PLUGIN_ID, CODEX_PLUGIN_ID, resolvePluginSettings, resolvePluginSwitches, type PluginSettingValues, type PluginSwitchSettings } from "./plugin-switches";

/** Host rows that exist only in one application form; the desktop form lists just its own. */
const FORM_ONLY_HOST_ENTRIES: Readonly<Record<string, "desktop" | "host" | "headless">> = Object.freeze({
  "desktop-app": "desktop",
  "agent-host": "host",
  "headless-runner": "headless",
});

/** Plugins that wrap a local CLI: the command they need, and the reason shown when it is not installed. */
const CLI_PLUGINS: Readonly<Record<string, { readonly command: string }>> = Object.freeze({
  [CODEX_PLUGIN_ID]: { command: "codex" },
  [CLAUDE_CODE_PLUGIN_ID]: { command: "claude" },
});

/** Resolves a command to its absolute path, or undefined when it is not installed. */
export type CommandResolver = (command: string) => Promise<string | undefined>;

/** The commands the catalog's CLI plugins need that this machine does not have: plugin id -> reason. */
export async function unavailablePluginReasons(catalog: readonly Pick<PluginListCatalogEntry, "id">[], resolve: CommandResolver): Promise<ReadonlyMap<string, string>> {
  const reasons = new Map<string, string>();
  await Promise.all(catalog.filter((entry) => entry.id in CLI_PLUGINS).map(async (entry) => {
    const { command } = CLI_PLUGINS[entry.id]!;
    let found: string | undefined;
    try { found = await resolve(command); } catch { found = undefined; }
    if (found === undefined) reasons.set(entry.id, `本机没有找到 ${command} 命令`);
  }));
  return reasons;
}

export type PluginListCatalogEntry = Pick<PluginCatalogEntry, "id" | "loaders" | "directory"> & { readonly manifest: { readonly display?: NonNullable<PluginCatalogEntry["manifest"]["display"]> } };

export function listPluginItems(input: {
  readonly catalog: readonly PluginListCatalogEntry[];
  readonly startupSwitches: ReadonlyMap<string, boolean>;
  readonly settings: PluginSwitchSettings;
  readonly form?: "desktop" | "host" | "headless";
  /** Plugin settings this launch loaded; a row whose saved settings differ shows the restart hint. */
  readonly startupPluginSettings?: PluginSettingValues;
  readonly unavailable?: ReadonlyMap<string, string>;
}): PluginListItem[] {
  const form = input.form ?? "desktop";
  const current = resolvePluginSwitches(input.settings, input.catalog);
  const currentSettings = resolvePluginSettings(input.settings);
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
      ...(input.unavailable?.has(entry.id) ? { unavailableReason: input.unavailable.get(entry.id)! } : {}),
      ...(currentSettings[entry.id] ? {
        settings: { ...currentSettings[entry.id]! },
        settingsPendingRestart: input.startupPluginSettings?.[entry.id] !== undefined && JSON.stringify(input.startupPluginSettings[entry.id]) !== JSON.stringify(currentSettings[entry.id]),
      } : {}),
    });
  }
  return items;
}

export function registerPluginsIpc(options: {
  readonly getMainWindow: () => BrowserWindow | undefined;
  readonly catalog: readonly PluginListCatalogEntry[];
  readonly startupSwitches: ReadonlyMap<string, boolean>;
  readonly settings: { getV4(): { readonly settings: PluginSwitchSettings } };
  readonly startupPluginSettings?: PluginSettingValues;
  /** Defaults to the login-shell lookup the subagent plugins use (`resolveCommand` of `@actspace/subagent`). */
  readonly resolveCommand?: CommandResolver;
}): () => void {
  const ipc = createIpcRegistrar({ getWindow: () => options.getMainWindow() ?? null, untrustedMessage: "无效的插件列表请求来源。" });
  // Settings are read on every call so `enabled` follows the latest switch; `loaded` stays at the startup value.
  const resolve: CommandResolver = options.resolveCommand ?? (async (command) => (await import("@actspace/subagent")).resolveCommand(command));
  ipc.handle(contract.plugins.list, async () => listPluginItems({
    catalog: options.catalog,
    startupSwitches: options.startupSwitches,
    settings: options.settings.getV4().settings,
    startupPluginSettings: options.startupPluginSettings,
    unavailable: await unavailablePluginReasons(options.catalog, resolve),
  }));
  return () => ipc.dispose();
}
