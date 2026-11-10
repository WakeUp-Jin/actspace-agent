// 扩展 › 插件 页 IPC（`plugins.*`）。

/**
 * The bundled Python the bash tool exposes as `actspace-python` (`pythonRuntime.getStatus`), shown under the
 * 命令行 plugin row. `runtime` is null when this build ships none (development without `pnpm python-runtime:prepare`).
 */
export interface PythonRuntimeStatus {
  runtime: {
    version: string;
    /** Absolute path of the runtime root, for the "where is it" line. */
    root: string;
    corePackages: string[];
  } | null;
  /** The on-demand data extension (numpy, pandas, markitdown …). */
  extension: {
    packages: string[];
    state: "missing" | "installing" | "ready" | "failed";
    /** Wheels done out of total while installing. */
    progress?: { completed: number; total: number };
    /** Why the last install failed; cleared when a new one starts. */
    error?: string;
    /** Where hand-placed wheels are picked up from on offline machines. */
    localWheelsDirectory: string;
  };
}

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
