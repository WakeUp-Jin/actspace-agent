import { isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import type { JsonValue } from "@actspace/cordis-adapter";
import type { BootManifest, ResolvedComposition } from "@actspace/composition";
import { createCordisRoot, mountCordisConfig, type CordisContext, type CordisLifecycleProbe, type CordisRootHandle } from "@actspace/cordis-adapter";

export type DshCordisBootOptions = {
  readonly configPath: string;
  readonly binName?: string;
  readonly createRoot?: () => Promise<CordisRootHandle>;
  readonly prepare?: (context: CordisContext) => Promise<void> | void;
  /** Services that must be visible after Loader settlement before publication. */
  readonly requiredServices?: readonly string[];
  /** Resolved Composer facts used to verify the file-backed transport. */
  readonly composition?: ResolvedComposition;
};

export type DshCordisBoot = {
  readonly context: CordisContext;
  readonly root: CordisRootHandle;
  readonly configPath: string;
  readonly dispose: () => Promise<CordisLifecycleProbe>;
};

/**
 * The process-local result of booting one resolved Profile. This is a
 * bootstrap boundary, not a runtime facade: application Bundles consume the
 * Context services directly and own their domain operations.
 */
export type BootedProfile = {
  readonly context: CordisContext;
  readonly root: CordisRootHandle;
  readonly configPath: string;
  readonly manifest: BootManifest;
  readonly shutdown: () => Promise<CordisLifecycleProbe>;
};

/**
 * Boot one trusted, file-backed Cordis tree and return only after Loader
 * settlement. Preparation runs after the root Loader is installed but before
 * the Include mounts `cordis.yml`, matching DSH's host/config boundary.
 */
export async function bootDshCordis(options: DshCordisBootOptions): Promise<DshCordisBoot> {
  const binName = options.binName ?? "actspace";
  if (!isAbsolute(options.configPath)) throw new Error(`${binName}: Cordis config path must be absolute: ${options.configPath}`);
  const root = await (options.createRoot ?? createCordisRoot)();
  try {
    if (options.composition !== undefined) await assertLoaderTransport(options.configPath, options.composition.loaderConfig);
    await options.prepare?.(root.context);
    await mountCordisConfig(root, options.configPath);
    const settlement = await root.awaitSettlement();
    if (!settlement.settled) throw new Error(`${binName}: Cordis settlement pending: ${settlement.pendingServices.join(", ")}`);
    const missing = (options.requiredServices ?? []).filter((serviceId) => root.getService(serviceId) === undefined);
    if (missing.length > 0) throw new Error(`${binName}: required Cordis services are missing: ${missing.join(", ")}`);
    return Object.freeze({
      context: root.context,
      root,
      configPath: options.configPath,
      dispose: () => root.dispose(),
    });
  } catch (cause) {
    await root.dispose();
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${binName}: Cordis startup failed: ${detail}`, { cause });
  }
}

/**
 * Boot a resolved Profile and expose its immutable manifest alongside the
 * Cordis root. The helper deliberately returns no generic Handle or facade.
 */
export async function bootProfile(options: DshCordisBootOptions & { readonly composition: BootManifest }): Promise<BootedProfile> {
  const boot = await bootDshCordis(options);
  return Object.freeze({
    context: boot.context,
    root: boot.root,
    configPath: boot.configPath,
    manifest: options.composition,
    shutdown: boot.dispose,
  });
}

/** Fail closed when the checked-in Include transport diverges from Composer. */
export async function assertLoaderTransport(configPath: string, loaderConfig: JsonValue | undefined): Promise<void> {
  if (loaderConfig === undefined || loaderConfig === null || typeof loaderConfig !== "object" || Array.isArray(loaderConfig)) return;
  const expected = (loaderConfig as Record<string, JsonValue>).entries;
  if (!Array.isArray(expected)) return;
  // A generic Composer instance may only carry `{ id, config }` entries. The
  // file-backed DSH transport check applies when the resolved loader facts
  // explicitly carry the transport's `name` field.
  if (!expected.some((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, JsonValue>).name === "string")) return;
  const content = await readFile(configPath, "utf8");
  const actual: Array<{ id: string; name: string; inject: string[] }> = [];
  let current: { id?: string; name?: string; inject: string[] } | undefined;
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*/u, "").trim();
    const id = line.match(/^-\s+id:\s*["']?([^"']+?)["']?$/u)?.[1];
    if (id !== undefined) {
      if (current?.id !== undefined && current.name !== undefined) actual.push({ id: current.id, name: current.name, inject: current.inject });
      current = { id, inject: [] };
      continue;
    }
    if (current === undefined) continue;
    const name = line.match(/^name:\s*["']?([^"']+?)["']?$/u)?.[1];
    if (name !== undefined) { current.name = name; continue; }
    const inject = line.match(/^inject:\s*\[([^\]]*)\]$/u)?.[1];
    if (inject !== undefined) current.inject = inject.split(",").map((value) => value.trim().replace(/^["']|["']$/gu, "")).filter(Boolean);
  }
  if (current?.id !== undefined && current.name !== undefined) actual.push({ id: current.id, name: current.name, inject: current.inject });
  const normalize = (value: JsonValue): unknown => value;
  const expectedRows = expected.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Composer loaderConfig entries must be objects.");
    const row = entry as Record<string, JsonValue>;
    return { id: String(row.id ?? ""), name: String(row.name ?? ""), inject: Array.isArray(row.inject) ? row.inject.map(String) : [] };
  });
  if (JSON.stringify(normalize(expectedRows as unknown as JsonValue)) !== JSON.stringify(actual)) {
    throw new Error(`Cordis transport config diverges from ResolvedComposition (expected ${expectedRows.length} entries, found ${actual.length}).`);
  }
}
