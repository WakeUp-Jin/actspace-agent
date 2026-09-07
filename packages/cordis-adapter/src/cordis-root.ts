import { dirname, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { CordisActivationScope, CordisContext, CordisEntryFact, CordisLifecycleProbe, CordisMountOptions, CordisRootHandle } from "./cordis-types.js";

export async function createCordisRoot(): Promise<CordisRootHandle> {
  return createCordisLoaderRootWithLoader(loadCordisRuntimeModules);
}

/**
 * Add a file-backed Cordis Include to an already bootstrapped Loader root.
 * The caller owns settlement and disposal; this function only creates the
 * Include entry so hosts can run preparation hooks before config activation.
 */
export async function mountCordisConfig(root: CordisRootHandle, absoluteConfigPath: string, entryId = "include"): Promise<string> {
  if (!isAbsolute(absoluteConfigPath)) throw new Error(`Cordis config path must be absolute: ${absoluteConfigPath}`);
  const context = root.context as CordisLoaderContextLike;
  // Bare Loader entries are resolved from the loader Context base URL. The
  // config file is the composition boundary, so use its directory rather
  // than this adapter package's dist directory as the module-resolution root.
  context.baseUrl = pathToFileURL(`${dirname(absoluteConfigPath)}/`).href;
  const loader = context.get?.("loader") as CordisLoaderLike | undefined;
  if (loader === undefined) throw new Error("Cordis Loader service was not published.");
  return loader.create({
    id: entryId,
    name: "cordis:include",
    config: { path: pathToFileURL(absoluteConfigPath).href },
    inject: Object.freeze([]),
  });
}

/**
 * Convenience boot for a single `cordis.yml` tree. It is deliberately small:
 * Loader/Include own module resolution and lifecycle, while the caller can
 * use `bootDshCordis` from `@actspace/boot` when it needs host preparation or
 * labelled startup diagnostics.
 */
export async function createCordisRootFromConfig(absoluteConfigPath: string): Promise<CordisRootHandle> {
  const root = await createCordisRoot();
  try {
    await mountCordisConfig(root, absoluteConfigPath);
    const settlement = await root.awaitSettlement();
    if (!settlement.settled) throw new Error(`Cordis settlement pending: ${settlement.pendingServices.join(", ")}`);
    return root;
  } catch (error) {
    await root.dispose();
    throw error;
  }
}

/** Lightweight core-only seam retained for deterministic domain tests. Production uses Loader-owned entries below. */

export async function createCordisRootWithLoader(load: () => Promise<CordisModuleLike>): Promise<CordisRootHandle> {
  const cordis = await load();
  if (typeof cordis.Context !== "function") throw new Error("Cordis public Context export is unavailable.");
  const context = new cordis.Context(); let disposed = false; const fibers = new Map<string, CordisFiberLike>(); const failures = new Map<string, string>(); const provided = new Map<string, readonly string[]>();
  return Object.freeze({
    context,
    mount: async (entryId: string, activate: (scope: CordisActivationScope) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>, options: CordisMountOptions = {}) => {
      if (fibers.has(entryId)) throw new Error(`Cordis Entry ${entryId} is already mounted.`);
      const serviceEntries = Object.entries(options.services ?? {}).sort(([left], [right]) => left.localeCompare(right));
      const declaredServices = Object.freeze([...(options.provides ?? serviceEntries.map(([name]) => name))].sort());
      if (serviceEntries.some(([name]) => !declaredServices.includes(name))) throw new Error(`Entry ${entryId} provides an undeclared service.`);
      provided.set(entryId, declaredServices);
      const plugin = {
        name: entryId,
        inject: Object.freeze([...(options.inject ?? [])]),
        apply: async (inner: CordisContextLike) => {
          for (const [name, value] of serviceEntries) {
            if (typeof inner.provide !== "function") throw new Error("Cordis Context.provide() is unavailable.");
            inner.provide(name, value);
          }
          const activated = new Set(serviceEntries.map(([name]) => name));
          const effect = await activate(Object.freeze({ context: inner, provide: (serviceId: string, value: unknown) => {
            if (!declaredServices.includes(serviceId)) throw new Error(`Entry ${entryId} attempted to provide undeclared service ${serviceId}.`);
            if (activated.has(serviceId)) throw new Error(`Entry ${entryId} provided service ${serviceId} more than once.`);
            inner.provide?.(serviceId, value); activated.add(serviceId);
          } }));
          const missing = declaredServices.filter((serviceId) => !activated.has(serviceId));
          if (missing.length > 0) throw new Error(`Entry ${entryId} did not provide declared services: ${missing.join(", ")}.`);
          return effect;
        },
      };
      const fiber = context.plugin?.(plugin); if (!fiber) throw new Error("Cordis Context.plugin() is unavailable."); fibers.set(entryId, fiber); try { await fiber; } catch (error) { failures.set(entryId, error instanceof Error ? error.message : String(error)); throw error; }
    },
    getService: <T = unknown>(serviceId: string): T | undefined => context.get?.(serviceId) as T | undefined,
    facts: () => Object.freeze([...fibers].map(([entryId, fiber]): CordisEntryFact => Object.freeze({ entryId, hasFiber: true, state: stateName(fiber.state), unresolvedServices: Object.freeze(Object.keys(fiber.inject ?? {}).filter((service) => context.get?.(service) === undefined)), providedServices: provided.get(entryId) ?? Object.freeze([]), ...(failures.has(entryId) ? { error: failures.get(entryId) } : {}) }))),
    awaitSettlement: async () => { const loader = context.get?.("loader") as { await?(): Promise<void> } | undefined; await loader?.await?.(); return probe(context, disposed); },
    dispose: async () => { if (!disposed) { disposed = true; await context.dispose?.(); } return probe(context, disposed); },
  });
}
type CordisFiberLike = PromiseLike<unknown> & { state?: number; inject?: Record<string, unknown> };
export type CordisModuleLike = { readonly Context?: new () => CordisContextLike };
type CordisContextLike = CordisContext & { baseUrl?: string; dispose?(): Promise<void> | void };
function probe(context: CordisContextLike, disposed: boolean): CordisLifecycleProbe { const fibers = context.reflect?.registry?.values?.() ?? []; const pending = [...fibers].filter((fiber) => fiber.state === "PENDING").flatMap((fiber) => fiber.inject ?? []); return Object.freeze({ settled: pending.length === 0, disposed, pendingServices: Object.freeze([...new Set(pending)].sort()) }); }
function stateName(state: number | undefined): CordisEntryFact["state"] { if (state === 2) return "ACTIVE"; if (state === 0 || state === 1) return "PENDING"; if (state === 3) return "FAILED"; return "DISPOSED"; }

export async function createCordisLoaderRootWithLoader(load: () => Promise<CordisRuntimeModules>): Promise<CordisRootHandle> {
  const modules = await load(); validateRuntimeModules(modules);
  const context = new modules.cordis.Context();
  context.baseUrl = new URL("./", import.meta.url).href;
  await context.plugin(modules.loader.default, { baseUrl: context.baseUrl });
  await context.plugin(modules.timer.default);
  const loader = context.get("loader") as CordisLoaderLike | undefined;
  if (loader === undefined) { await disposeContext(context); throw new Error("Cordis Loader service was not published."); }
  loader.builtins.include = modules.include.default;
  loader.builtins.group = modules.group.default;
  const mounted: string[] = []; const provided = new Map<string, readonly string[]>(); const failures = new Map<string, string>(); let disposed = false;
  return Object.freeze({
    context,
    mount: async (entryId: string, activate: (scope: CordisActivationScope) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>, options: CordisMountOptions = {}) => {
      if (mounted.includes(entryId)) throw new Error(`Cordis Entry ${entryId} is already mounted.`);
      const serviceEntries = Object.entries(options.services ?? {}).sort(([left], [right]) => left.localeCompare(right));
      const declaredServices = Object.freeze([...(options.provides ?? serviceEntries.map(([name]) => name))].sort());
      if (serviceEntries.some(([name]) => !declaredServices.includes(name))) throw new Error(`Entry ${entryId} provides an undeclared service.`);
      const builtin = `actspace.${entryId}`;
      loader.builtins[builtin] = {
        name: entryId,
        apply: async (inner: CordisContextLike) => {
          const activated = new Set<string>();
          for (const [name, value] of serviceEntries) { requireProvide(inner)(name, value); activated.add(name); }
          const effect = await activate(Object.freeze({ context: inner, provide: (serviceId: string, value: unknown) => {
            if (!declaredServices.includes(serviceId)) throw new Error(`Entry ${entryId} attempted to provide undeclared service ${serviceId}.`);
            if (activated.has(serviceId)) throw new Error(`Entry ${entryId} provided service ${serviceId} more than once.`);
            requireProvide(inner)(serviceId, value); activated.add(serviceId);
          } }));
          const missing = declaredServices.filter((serviceId) => !activated.has(serviceId));
          if (missing.length > 0) throw new Error(`Entry ${entryId} did not provide declared services: ${missing.join(", ")}.`);
          return effect;
        },
      };
      provided.set(entryId, declaredServices); mounted.push(entryId);
      try { await loader.create({ id: entryId, name: `cordis:${builtin}`, config: {}, inject: Object.freeze([...(options.inject ?? [])]) }); }
      catch (error) { failures.set(entryId, error instanceof Error ? error.message : String(error)); throw error; }
    },
    getService: <T = unknown>(serviceId: string): T | undefined => context.get(serviceId) as T | undefined,
    facts: () => Object.freeze(mounted.map((entryId): CordisEntryFact => {
      const entry = safeResolve(loader, entryId); const fiber = entry?.fiber;
      return Object.freeze({ entryId, hasFiber: fiber !== undefined, state: failures.has(entryId) ? "FAILED" : stateName(fiber?.state), unresolvedServices: Object.freeze(Object.keys(fiber?.inject ?? {}).filter((service) => fiber?.ctx?.get?.(service) === undefined)), providedServices: provided.get(entryId) ?? Object.freeze([]), ...(failures.has(entryId) ? { error: failures.get(entryId) } : {}) });
    })),
    awaitSettlement: async () => { await loader.await(); return probeLoader(loader, disposed); },
    dispose: async () => { if (!disposed) { disposed = true; await disposeContext(context); } return probeLoader(loader, disposed); },
  });
}

export type CordisRuntimeModules = {
  readonly cordis: { readonly Context: new () => CordisLoaderContextLike };
  readonly loader: { readonly default: unknown };
  readonly include: { readonly default: unknown };
  readonly group: { readonly default: unknown };
  readonly timer: { readonly default: unknown };
};

type CordisLoaderFiberLike = CordisFiberLike & { ctx?: { get?(name: string): unknown } };
type CordisLoaderEntryLike = { readonly fiber?: CordisLoaderFiberLike; readonly disabled?: boolean; readonly options?: { readonly name?: string } };
type CordisLoaderLike = { readonly builtins: Record<string, unknown>; create(options: { readonly id: string; readonly name: string; readonly config: unknown; readonly inject: readonly string[] }): Promise<string>; resolve(id: string): CordisLoaderEntryLike; entries(): Iterable<CordisLoaderEntryLike>; await(): Promise<void> };
type CordisLoaderContextLike = CordisContextLike & { baseUrl?: string; plugin(plugin: unknown, config?: unknown): CordisFiberLike; get(name: string): unknown; fiber?: { dispose(): Promise<void> | void } };

async function loadCordisRuntimeModules(): Promise<CordisRuntimeModules> {
  const names = ["@deepseek-ai/cordis", "@deepseek-ai/cordis-plugin-loader", "@deepseek-ai/cordis-plugin-include", "@deepseek-ai/cordis-plugin-group", "@deepseek-ai/cordis-plugin-timer"] as const;
  const [cordis, loader, include, group, timer] = await Promise.all(names.map((name) => import(name)));
  return { cordis: cordis as CordisRuntimeModules["cordis"], loader: loader as CordisRuntimeModules["loader"], include: include as CordisRuntimeModules["include"], group: group as CordisRuntimeModules["group"], timer: timer as CordisRuntimeModules["timer"] };
}
function validateRuntimeModules(modules: CordisRuntimeModules): void { if (typeof modules.cordis.Context !== "function" || modules.loader.default === undefined || modules.include.default === undefined || modules.group.default === undefined || modules.timer.default === undefined) throw new Error("Cordis runtime family public exports are incomplete."); }
function requireProvide(context: CordisContextLike): (name: string, value: unknown) => void { if (typeof context.provide !== "function") throw new Error("Cordis Context.provide() is unavailable."); return (name, value) => { context.provide!(name, value); }; }
function safeResolve(loader: CordisLoaderLike, entryId: string): CordisLoaderEntryLike | undefined { try { return loader.resolve(entryId); } catch { return undefined; } }
function probeLoader(loader: CordisLoaderLike, disposed: boolean): CordisLifecycleProbe { const pending = [...loader.entries()].flatMap((entry) => entry.fiber?.state === 0 || entry.fiber?.state === 1 ? Object.keys(entry.fiber.inject ?? {}).filter((service) => entry.fiber?.ctx?.get?.(service) === undefined) : []); return Object.freeze({ settled: pending.length === 0, disposed, pendingServices: Object.freeze([...new Set(pending)].sort()) }); }
async function disposeContext(context: CordisLoaderContextLike): Promise<void> { if (context.fiber?.dispose !== undefined) await context.fiber.dispose(); else await context.dispose?.(); }
