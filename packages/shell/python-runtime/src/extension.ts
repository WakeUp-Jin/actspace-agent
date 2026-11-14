/**
 * The on-demand extension layer (numpy, pandas, markitdown …): downloaded into the Host's data root, verified
 * against the sha256 pins in `runtime.json`, and handed to the bundled interpreter through `ACTSPACE_PYTHON_EXT`
 * (its `sitecustomize.py` adds that directory as a site dir). Nothing is written inside the app bundle.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PythonRuntimeManifest, PythonWheel } from "./runtime-manifest.js";
import { installWheel } from "./wheel.js";

export const EXTENSION_LAYER_MARKER = "extension.json";
/** Wheels placed here by hand (offline machines) are used instead of downloading when their sha256 matches. */
export const EXTENSION_LAYER_LOCAL_WHEELS = "wheels";

export type ExtensionLayerProgress = {
  readonly wheel: string;
  /** Wheels finished so far, out of `total`. */
  readonly completed: number;
  readonly total: number;
};

export function extensionLayerRoot(dataRoot: string): string {
  return join(dataRoot, "runtime", "python-ext");
}

export function extensionLayerDirectory(dataRoot: string, digest: string): string {
  return join(extensionLayerRoot(dataRoot), digest);
}

/** The layer's site-packages when it is fully installed for this manifest, else undefined. */
export function installedExtensionSitePackages(dataRoot: string, manifest: PythonRuntimeManifest): string | undefined {
  const directory = extensionLayerDirectory(dataRoot, manifest.extension.digest);
  try {
    const marker = JSON.parse(readFileSync(join(directory, EXTENSION_LAYER_MARKER), "utf8")) as { digest?: unknown };
    if (marker.digest !== manifest.extension.digest) return undefined;
  } catch {
    return undefined;
  }
  const sitePackages = join(directory, "site-packages");
  return existsSync(sitePackages) ? sitePackages : undefined;
}

/** The 16-hex-character name of the layer a wheel set produces; `prepare.mjs` computes the same value. */
export function extensionLayerDigest(wheels: readonly Pick<PythonWheel, "sha256">[]): string {
  const hash = createHash("sha256");
  hash.update(
    [...wheels]
      .map((wheel) => wheel.sha256)
      .sort()
      .join("\n"),
  );
  return hash.digest("hex").slice(0, 16);
}

export type InstallExtensionLayerOptions = {
  readonly manifest: PythonRuntimeManifest;
  readonly dataRoot: string;
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExtensionLayerProgress) => void;
};

/**
 * Downloads and installs the layer, replacing a broken or partial one; returns its site-packages.
 * Other layers (older digests) are removed on success. Partial work lives in a sibling staging directory,
 * so a failure never leaves a half-installed layer under the final name.
 */
export async function installExtensionLayer(options: InstallExtensionLayerOptions): Promise<string> {
  const { manifest, dataRoot } = options;
  const root = extensionLayerRoot(dataRoot);
  const digest = manifest.extension.digest;
  if (extensionLayerDigest(manifest.extension.wheels) !== digest)
    throw new Error("Python runtime manifest: extension digest does not match its wheels.");
  const final = extensionLayerDirectory(dataRoot, digest);
  const staging = join(root, `.partial-${randomUUID()}`);
  const sitePackages = join(staging, "site-packages");
  await mkdir(sitePackages, { recursive: true });
  try {
    const total = manifest.extension.wheels.length;
    let completed = 0;
    for (const wheel of manifest.extension.wheels) {
      options.signal?.throwIfAborted();
      options.onProgress?.({ wheel: wheel.file, completed, total });
      installWheel(await obtainWheel(wheel, root, options), sitePackages);
      completed += 1;
    }
    options.onProgress?.({ wheel: "", completed, total });
    await writeFile(
      join(staging, EXTENSION_LAYER_MARKER),
      `${JSON.stringify({ digest, python: manifest.python, wheels: manifest.extension.wheels.map(({ name, version, sha256 }) => ({ name, version, sha256 })), installedAt: new Date().toISOString() }, null, 2)}\n`,
    );
    await rm(final, { recursive: true, force: true });
    await rename(staging, final);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  await removeOtherLayers(root, digest);
  return join(final, "site-packages");
}

async function obtainWheel(wheel: PythonWheel, root: string, options: InstallExtensionLayerOptions): Promise<Buffer> {
  const local = join(root, EXTENSION_LAYER_LOCAL_WHEELS, wheel.file);
  if (existsSync(local)) {
    const bytes = await readFile(local);
    if (sha256(bytes) === wheel.sha256) return bytes;
  }
  const download = options.fetch ?? fetch;
  const response = await download(wheel.url, { signal: options.signal, redirect: "follow" });
  if (!response.ok) throw new Error(`Downloading ${wheel.file} failed: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== wheel.sha256) throw new Error(`${wheel.file} does not match its pinned sha256 (got ${actual}).`);
  return bytes;
}

async function removeOtherLayers(root: string, keep: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => entry !== keep && entry !== EXTENSION_LAYER_LOCAL_WHEELS && !entry.startsWith(".partial-"))
      .map((entry) => rm(join(root, entry), { recursive: true, force: true }).catch(() => undefined)),
  );
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
