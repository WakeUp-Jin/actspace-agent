// 扩展 › 插件 页 IPC（`plugins.*`）。

/** One row of the 扩展 › 插件 page (`plugins.list`), computed in main from the plugin catalog, the startup switches and settings. */
export interface PluginListItem {
  /** Catalog Entry id; also the key of `settings.tools.plugins`. */
  id: string;
  title: string;
  description: string;
  scope: "global" | "session";
  /** Capability directory under `packages/`, such as `context`. */
  directory: string;
  canDisable: boolean;
  /** Whether the plugin was loaded at this launch. */
  loaded: boolean;
  /** The switch value in settings (what the next launch will load). */
  enabled: boolean;
  /** Why the plugin cannot do its job on this machine (for example the CLI it wraps is not installed); absent when available. */
  unavailableReason?: string;
  /** Current plugin settings (defaults filled in), keyed by setting name; only plugins that have settings carry it. */
  settings?: Record<string, string>;
  /** The saved settings differ from what this launch loaded; they apply after a restart. */
  settingsPendingRestart?: boolean;
}
