import { Context, type Plugin } from "@deepseek-ai/cordis";
import { EntryTree, type EntryOptions } from "@deepseek-ai/cordis-plugin-loader";
import { toCordisBehavior } from "./behavior-loader.js";
import { entryId } from "./identity.js";
import type { CordisContext } from "./cordis-types.js";

export interface IsolatedCordisEntry {
  readonly id: string;
  readonly module: unknown;
  readonly config: unknown;
  readonly provides: readonly string[];
  readonly injects: readonly string[];
}
export interface IsolatedCordisTree {
  readonly context: CordisContext;
  getService<T>(name: string): T | undefined;
  dispose(): Promise<void>;
}
class MemoryTree extends EntryTree {
  constructor(ctx: Context, readonly modules: ReadonlyMap<string, Plugin>) {
    const entry = ctx.fiber.entry;
    const previousTree = entry?.subtree;
    const previousGroup = entry?.subgroup;
    super(ctx);
    if (entry) { entry.subtree = previousTree; entry.subgroup = previousGroup; }
  }
  write(): void {}
  override import(name: string): Plugin | undefined {
    return this.modules.get(name) ?? (name === "cordis:group" ? this.ctx.loader.builtins.group : undefined);
  }
}

/** Mount an independent Loader tree under one existing Host, without mutating its base URL. */
export async function mountIsolatedCordisTree(options: {
  readonly parent: CordisContext;
  readonly entries: readonly IsolatedCordisEntry[];
  readonly sharedServices: readonly string[];
  readonly decorate?: (context: CordisContext) => CordisContext;
}): Promise<IsolatedCordisTree> {
  const parent = options.parent as Context;
  const provided = new Set<string>();
  for (const entry of options.entries) for (const name of entry.provides) {
    if (provided.has(name) || options.sharedServices.includes(name)) throw new Error(`Conflicting Harness provider: ${name}`);
    provided.add(name);
  }
  for (const entry of options.entries) for (const name of entry.injects) {
    if (!provided.has(name) && !options.sharedServices.includes(name)) throw new Error(`Undeclared Harness dependency: ${entry.id}/${name}`);
    if (!provided.has(name) && parent.get(name) === undefined) throw new Error(`Missing Host service: ${name}`);
  }
  const modules = new Map<string, Plugin>();
  const rows: EntryOptions[] = options.entries.map(entry => {
    entryId(entry.id);
    if (entry.id === "harness") throw new Error(`Reserved Harness entry id: ${entry.id}`);
    if (modules.has(entry.id)) throw new Error(`Duplicate Harness entry: ${entry.id}`);
    const behavior = toCordisBehavior(entry.module, entry.id) as { apply(ctx: Context, config: unknown): unknown; inject?: unknown };
    // Manifest injection is authoritative. Do not permit a module to reach a hidden Host service.
    const declared = behavior.inject;
    const names = Array.isArray(declared) ? declared : declared && typeof declared === "object" ? Object.keys(declared) : [];
    if (names.some(name => !entry.injects.includes(String(name)))) throw new Error(`Behavior injection differs from manifest: ${entry.id}`);
    modules.set(entry.id, { name: entry.id, inject: [...entry.injects], apply: (ctx: Context, config: unknown) => {
      const guarded = ctx.extend({ provide: (name: string, value?: unknown) => {
        if (!entry.provides.includes(name)) throw new Error(`Undeclared Harness service: ${entry.id}/${name}`);
        return ctx.provide(name, value);
      } });
      return behavior.apply(guarded, config);
    } } as Plugin);
    return { id: entry.id, name: entry.id, config: structuredClone(entry.config), inject: [...entry.injects] };
  });
  const ownership = Symbol("harness-tree");
  const token = {};
  let tree!: MemoryTree;
  const owner = parent.plugin({ inject: ["loader"], apply: (inner: Context) => {
    const decorated = (options.decorate?.(inner as CordisContext) ?? inner) as Context;
    tree = new MemoryTree(decorated.extend({ [ownership]: token }), modules);
  } });
  await owner;
  if (!tree) { await owner.dispose(); throw new Error("Harness owner did not activate"); }
  let disposal: Promise<void> | undefined;
  const dispose = (): Promise<void> => disposal ??= (async () => {
    const logged: unknown[] = [];
    // Cordis logs teardown exceptions instead of rejecting Fiber.dispose(). Capture only this tree.
    const removeExporter = parent.logger.exporter({ export(message) {
      const fiber = message.fiber?.deref();
      if (message.type === "error" && fiber && Reflect.get(fiber.ctx, ownership) === token) logged.push(message.args[0]);
    } });
    const results = await Promise.allSettled([...tree.entries()].reverse().map(entry => entry.fiber?.dispose()));
    const ownerResult = await Promise.allSettled([owner.dispose()]);
    removeExporter();
    const errors = [...results, ...ownerResult].filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
    errors.push(...logged);
    if (errors.length) throw new AggregateError(errors, "Harness tree cleanup failed");
  })();
  try {
    await tree.root.update([{ id: "harness", name: "cordis:group", group: true, isolate: Object.fromEntries([...provided].map(name => [name, true as const])), config: rows }]);
    await tree.await();
    for (const entry of tree.entries()) {
      if (!entry.fiber || entry.fiber.state !== 2) throw new Error(`Harness entry not active: ${entry.id}`);
      if (entry.options.id === "harness") continue;
      const declaration = options.entries.find(row => row.id === entry.options.id)!;
      for (const name of declaration.provides) if (entry.ctx.get(name) === undefined) throw new Error(`Harness service missing: ${entry.id}/${name}`);
    }
    const group = tree.resolve("harness").subgroup;
    if (!group) throw new Error("Harness group did not activate");
    for (const impl of Object.getOwnPropertySymbols(parent.reflect.store).map(key => parent.reflect.store[key])) {
      if (!impl?.fiber) continue;
      const owned = Reflect.get(impl.fiber.ctx, ownership) === token;
      if (owned && !provided.has(impl.name)) throw new Error(`Undeclared Harness service: ${impl.name}`);
      if (owned && parent[Context.isolate][impl.name] === group.ctx[Context.isolate][impl.name]) throw new Error(`Harness service leaked: ${impl.name}`);
    }
    return Object.freeze({ context: group.ctx as CordisContext, getService: <T>(name: string): T | undefined => provided.has(name) ? group.ctx.get(name) as T : undefined, dispose });
  } catch (error) {
    try { await dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Harness activation and cleanup failed"); }
    throw error;
  }
}
