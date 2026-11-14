/**
 * The bundled Python (`actspace-python`) as the desktop sees it: where it is, and the on-demand data extension's
 * install state. One instance per process; the bash tool reads `extensionSitePackages()` on every command, so a
 * finished download is live for the next command without a restart.
 */
import { join } from "node:path";
import {
  EXTENSION_LAYER_LOCAL_WHEELS,
  extensionLayerRoot,
  findBundledPythonRuntime,
  installedExtensionSitePackages,
  installExtensionLayer,
  pythonRuntimeForBash,
  repoPythonRuntimePath,
  type PythonRuntime,
  type PythonRuntimeForBash,
} from "@actspace/python-runtime";
import type { PythonRuntimeStatus } from "@actspace/shared";

/**
 * A packaged app only trusts the runtime it ships with; development builds take `ACTSPACE_PYTHON_RUNTIME` or what
 * `pnpm python-runtime:prepare` put under `dist/`. Undefined means no bundled Python (the prompt then falls back
 * to the system interpreter), never a lookup on PATH.
 */
export function resolveDesktopPythonRuntime(input: {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly repoRoot: string;
  readonly env: NodeJS.ProcessEnv;
}): PythonRuntime | undefined {
  return findBundledPythonRuntime(
    input.packaged
      ? [join(input.resourcesPath, "app", "runtime", "python")]
      : [input.env.ACTSPACE_PYTHON_RUNTIME, repoPythonRuntimePath(input.repoRoot)],
  );
}

type ExtensionState = PythonRuntimeStatus["extension"];

export class PythonRuntimeService {
  readonly #runtime: PythonRuntime | undefined;
  readonly #dataRoot: string;
  readonly #log: (message: string, details?: Record<string, unknown>) => void;
  readonly #fetch: typeof fetch | undefined;
  #sitePackages: string | undefined;
  #install: Promise<void> | undefined;
  #progress: ExtensionState["progress"];
  #error: string | undefined;

  constructor(options: {
    readonly runtime: PythonRuntime | undefined;
    readonly dataRoot: string;
    readonly log?: (message: string, details?: Record<string, unknown>) => void;
    readonly fetch?: typeof fetch;
  }) {
    this.#runtime = options.runtime;
    this.#dataRoot = options.dataRoot;
    this.#log = options.log ?? (() => undefined);
    this.#fetch = options.fetch;
    this.#sitePackages =
      options.runtime === undefined
        ? undefined
        : installedExtensionSitePackages(options.dataRoot, options.runtime.manifest);
  }

  /** What the bash tool gets; undefined when this build ships no runtime. */
  forBash(): PythonRuntimeForBash | undefined {
    return this.#runtime === undefined ? undefined : pythonRuntimeForBash(this.#runtime, () => this.#sitePackages);
  }

  getStatus(): PythonRuntimeStatus {
    const runtime = this.#runtime;
    return {
      runtime:
        runtime === undefined
          ? null
          : {
              version: runtime.manifest.python.version,
              root: runtime.root,
              corePackages: runtime.manifest.core.map((pin) => pin.name),
            },
      extension: {
        packages: runtime === undefined ? [] : [...runtime.manifest.extension.packages],
        state:
          this.#install !== undefined
            ? "installing"
            : this.#sitePackages !== undefined
              ? "ready"
              : this.#error !== undefined
                ? "failed"
                : "missing",
        ...(this.#install !== undefined && this.#progress !== undefined ? { progress: this.#progress } : {}),
        ...(this.#install === undefined && this.#error !== undefined ? { error: this.#error } : {}),
        localWheelsDirectory: join(extensionLayerRoot(this.#dataRoot), EXTENSION_LAYER_LOCAL_WHEELS),
      },
    };
  }

  /** Starts the extension download unless one is running or the layer is already installed. */
  installExtension(): PythonRuntimeStatus {
    const runtime = this.#runtime;
    if (runtime !== undefined && this.#install === undefined && this.#sitePackages === undefined) {
      this.#error = undefined;
      this.#progress = { completed: 0, total: runtime.manifest.extension.wheels.length };
      this.#install = installExtensionLayer({
        manifest: runtime.manifest,
        dataRoot: this.#dataRoot,
        ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
        onProgress: (progress) => {
          this.#progress = { completed: progress.completed, total: progress.total };
        },
      })
        .then(
          (sitePackages) => {
            this.#sitePackages = sitePackages;
            this.#log("python extension installed", { sitePackages });
          },
          (error: unknown) => {
            this.#error = error instanceof Error ? error.message : String(error);
            this.#log("python extension install failed", { error: this.#error });
          },
        )
        .finally(() => {
          this.#install = undefined;
          this.#progress = undefined;
        });
    }
    return this.getStatus();
  }

  /** Resolves when no install is running (tests and shutdown). */
  async settle(): Promise<void> {
    await this.#install;
  }
}
