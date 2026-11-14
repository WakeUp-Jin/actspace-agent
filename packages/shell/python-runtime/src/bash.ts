import { installedExtensionSitePackages } from "./extension.js";
import type { PythonRuntime } from "./locate.js";

/** What `@actspace/tool-shell` takes as `python` (kept structural so this package stays a leaf). */
export type PythonRuntimeForBash = {
  readonly version: string;
  readonly shimDirectory: string;
  readonly shim: string;
  readonly corePackages: readonly string[];
  readonly extensionPackages: readonly string[];
  readonly extensionSitePackages: () => string | undefined;
};

/**
 * The Bash view of a runtime. `extensionSitePackages` defaults to a per-call check of `<dataRoot>/runtime/python-ext`,
 * so a layer installed while a Session runs is picked up by its next command; a Host that tracks the download itself
 * passes its own getter.
 */
export function pythonRuntimeForBash(
  runtime: PythonRuntime,
  extension: string | (() => string | undefined),
): PythonRuntimeForBash {
  const extensionSitePackages =
    typeof extension === "function" ? extension : () => installedExtensionSitePackages(extension, runtime.manifest);
  return Object.freeze({
    version: runtime.manifest.python.version,
    shimDirectory: runtime.shimDirectory,
    shim: runtime.shim,
    corePackages: runtime.manifest.core.map((pin) => pin.name),
    extensionPackages: runtime.manifest.extension.packages,
    extensionSitePackages,
  });
}
