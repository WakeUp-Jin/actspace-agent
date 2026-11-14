/**
 * `runtime.json`, written by `scripts/python-runtime/prepare.mjs` into the root of a prepared runtime.
 * The app reads it to find the interpreter and to know which extension wheels it may download.
 */

export const PYTHON_RUNTIME_MANIFEST_FILE = "runtime.json";
export const PYTHON_RUNTIME_TARGETS = ["mac-arm64", "mac-x64", "linux-x64", "linux-arm64", "win-x64"] as const;
export type PythonRuntimeTarget = (typeof PYTHON_RUNTIME_TARGETS)[number];

export type PythonPackagePin = { readonly name: string; readonly version: string };
export type PythonWheel = PythonPackagePin & { readonly file: string; readonly url: string; readonly sha256: string };

export type PythonRuntimeManifest = {
  readonly schemaVersion: 1;
  readonly target: PythonRuntimeTarget;
  readonly python: { readonly version: string; readonly release: string };
  /** Relative to the runtime root, with `/` separators. */
  readonly executable: string;
  readonly sitePackages: string;
  readonly shimDirectory: string;
  readonly core: readonly PythonPackagePin[];
  /** The on-demand layer: `digest` names its install directory; `wheels` are what to download and verify. */
  readonly extension: {
    readonly digest: string;
    readonly packages: readonly string[];
    readonly wheels: readonly PythonWheel[];
  };
};

const SHA256 = /^[a-f0-9]{64}$/;
const DIGEST = /^[a-f0-9]{16}$/;
const RELATIVE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function fail(detail: string): never {
  throw new Error(`Invalid Python runtime manifest: ${detail}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) fail(`${where}.${key} must be a non-empty string`);
  return value;
}

function relativePath(record: Record<string, unknown>, key: string): string {
  const value = string(record, key, "manifest");
  if (!RELATIVE.test(value) || value.split("/").some((segment) => segment === "." || segment === ".."))
    fail(`${key} must be a relative path without '.' or '..' segments or separators other than '/'`);
  return value;
}

function pin(value: unknown, where: string): PythonPackagePin {
  if (!isRecord(value)) fail(`${where} must be an object`);
  return { name: string(value, "name", where), version: string(value, "version", where) };
}

function wheel(value: unknown, where: string): PythonWheel {
  if (!isRecord(value)) fail(`${where} must be an object`);
  const base = pin(value, where);
  const file = string(value, "file", where);
  if (!/^[A-Za-z0-9._+-]+\.whl$/.test(file)) fail(`${where}.file must be a wheel file name`);
  const url = string(value, "url", where);
  if (!url.startsWith("https://")) fail(`${where}.url must be https`);
  const sha256 = string(value, "sha256", where);
  if (!SHA256.test(sha256)) fail(`${where}.sha256 must be 64 hex characters`);
  return { ...base, file, url, sha256 };
}

export function parsePythonRuntimeManifest(value: unknown): PythonRuntimeManifest {
  if (!isRecord(value)) fail("not an object");
  if (value.schemaVersion !== 1) fail("unsupported schemaVersion");
  const target = string(value, "target", "manifest");
  if (!(PYTHON_RUNTIME_TARGETS as readonly string[]).includes(target)) fail(`unknown target ${target}`);
  if (!isRecord(value.python)) fail("python must be an object");
  const python = {
    version: string(value.python, "version", "python"),
    release: string(value.python, "release", "python"),
  };
  if (!Array.isArray(value.core)) fail("core must be an array");
  if (!isRecord(value.extension)) fail("extension must be an object");
  const digest = string(value.extension, "digest", "extension");
  if (!DIGEST.test(digest)) fail("extension.digest must be 16 hex characters");
  if (!Array.isArray(value.extension.packages) || !value.extension.packages.every((item) => typeof item === "string"))
    fail("extension.packages must be strings");
  if (!Array.isArray(value.extension.wheels)) fail("extension.wheels must be an array");
  return Object.freeze({
    schemaVersion: 1,
    target: target as PythonRuntimeTarget,
    python,
    executable: relativePath(value, "executable"),
    sitePackages: relativePath(value, "sitePackages"),
    shimDirectory: relativePath(value, "shimDirectory"),
    core: value.core.map((item, index) => pin(item, `core[${index}]`)),
    extension: {
      digest,
      packages: [...(value.extension.packages as string[])],
      wheels: value.extension.wheels.map((item, index) => wheel(item, `extension.wheels[${index}]`)),
    },
  });
}

/** The target name of a machine, or undefined when no runtime is built for it. */
export function pythonRuntimeTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): PythonRuntimeTarget | undefined {
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : arch === "x64" ? "mac-x64" : undefined;
  if (platform === "linux") return arch === "x64" ? "linux-x64" : arch === "arm64" ? "linux-arm64" : undefined;
  if (platform === "win32") return arch === "x64" ? "win-x64" : undefined;
  return undefined;
}
