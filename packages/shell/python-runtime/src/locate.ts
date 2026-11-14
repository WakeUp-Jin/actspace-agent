import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  PYTHON_RUNTIME_MANIFEST_FILE,
  parsePythonRuntimeManifest,
  pythonRuntimeTarget,
  type PythonRuntimeManifest,
} from "./runtime-manifest.js";

/** A prepared runtime on disk: the manifest plus the absolute paths Bash needs. */
export type PythonRuntime = {
  readonly root: string;
  readonly manifest: PythonRuntimeManifest;
  readonly executable: string;
  readonly sitePackages: string;
  /** Holds `actspace-python` (and `actspace-python.cmd` on Windows); goes in front of `PATH`. */
  readonly shimDirectory: string;
  readonly shim: string;
};

export const PYTHON_SHIM_NAME = "actspace-python";

/**
 * Loads the runtime at `root`, or returns undefined when there is none or it is unusable (missing manifest,
 * wrong target for this machine, interpreter or shim not executable). Never looks on `PATH`.
 */
export function loadPythonRuntime(
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): PythonRuntime | undefined {
  if (!isAbsolute(root)) return undefined;
  let manifest: PythonRuntimeManifest;
  try {
    manifest = parsePythonRuntimeManifest(JSON.parse(readFileSync(join(root, PYTHON_RUNTIME_MANIFEST_FILE), "utf8")));
  } catch {
    return undefined;
  }
  if (manifest.target !== pythonRuntimeTarget(platform, arch)) return undefined;
  const executable = join(root, ...manifest.executable.split("/"));
  const shimDirectory = join(root, ...manifest.shimDirectory.split("/"));
  const shim = join(shimDirectory, platform === "win32" ? `${PYTHON_SHIM_NAME}.cmd` : PYTHON_SHIM_NAME);
  if (!isExecutableFile(executable) || !isExecutableFile(shim)) return undefined;
  return Object.freeze({
    root,
    manifest,
    executable,
    sitePackages: join(root, ...manifest.sitePackages.split("/")),
    shimDirectory,
    shim,
  });
}

/** The first candidate that loads; undefined entries are skipped. */
export function findBundledPythonRuntime(candidates: readonly (string | undefined)[]): PythonRuntime | undefined {
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const runtime = loadPythonRuntime(candidate);
    if (runtime !== undefined) return runtime;
  }
  return undefined;
}

/** Where `pnpm python-runtime:prepare` puts the runtime for this machine. */
export function repoPythonRuntimePath(
  repoRoot: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const target = pythonRuntimeTarget(platform, arch);
  return target === undefined ? undefined : join(repoRoot, "dist", "python-runtime", target);
}

function isExecutableFile(path: string): boolean {
  try {
    // Windows has no execute bit; a regular file is enough there.
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
