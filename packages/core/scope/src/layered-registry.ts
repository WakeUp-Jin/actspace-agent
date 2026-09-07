import { ScopeDisposer, type AsyncDisposer } from "./disposer.js";
import { scopeChainOf, type ScopeKey } from "./scope.js";

export type RegistryEntry<T> = { readonly id: string; readonly value: T; readonly owner: string };

type RegistryLayers<T> = {
  readonly global: Map<string, RegistryEntry<T>>;
  readonly scoped: WeakMap<ScopeKey, Map<string, RegistryEntry<T>>>;
};

/** One scope-aware view over shared global and exact-scope layers. */
export class ScopedRegistry<T> {
  readonly #layers: RegistryLayers<T>;

  constructor(
    readonly scopeKey?: ScopeKey,
    private readonly ownerDisposer?: ScopeDisposer,
    layers?: RegistryLayers<T>,
  ) {
    this.#layers = layers ?? { global: new Map(), scoped: new WeakMap() };
  }

  forScope(scopeKey: ScopeKey, ownerDisposer?: ScopeDisposer): ScopedRegistry<T> {
    return new ScopedRegistry(scopeKey, ownerDisposer, this.#layers);
  }

  global(ownerDisposer?: ScopeDisposer): ScopedRegistry<T> {
    return new ScopedRegistry(undefined, ownerDisposer, this.#layers);
  }

  register(entry: RegistryEntry<T>, disposer?: AsyncDisposer): () => void {
    const local = this.#local(true);
    if (local.has(entry.id)) throw new Error(`Duplicate scoped registration ${entry.id}.`);
    const inherited = this.#inherited(entry.id);
    if (inherited?.owner === "@actspace/core" && entry.owner !== "@actspace/core") throw new Error(`Registration ${entry.id} cannot shadow an ActSpace Core contribution.`);
    const retained = Object.freeze(entry);
    local.set(entry.id, retained);
    const remove = () => {
      if (local.get(entry.id) !== retained) return;
      local.delete(entry.id);
      if (local.size === 0 && this.scopeKey !== undefined) this.#layers.scoped.delete(this.scopeKey);
    };
    try {
      const cancel = this.ownerDisposer?.add(async () => { remove(); await disposer?.(); });
      return () => { remove(); cancel?.(); };
    } catch (error) {
      remove();
      throw error;
    }
  }

  get(id: string): RegistryEntry<T> | undefined {
    let resolved = this.#layers.global.get(id);
    for (const key of scopeChainOf(this.scopeKey).reverse()) resolved = this.#layers.scoped.get(key)?.get(id) ?? resolved;
    return resolved;
  }

  entries(): readonly RegistryEntry<T>[] {
    const merged = new Map(this.#layers.global);
    for (const key of scopeChainOf(this.scopeKey).reverse()) {
      for (const [id, entry] of this.#layers.scoped.get(key) ?? []) merged.set(id, entry);
    }
    return Object.freeze([...merged.values()]);
  }

  localEntries(): readonly RegistryEntry<T>[] { return Object.freeze([...(this.#local(false)?.values() ?? [])]); }

  #inherited(id: string): RegistryEntry<T> | undefined {
    if (this.scopeKey === undefined) return undefined;
    let resolved = this.#layers.global.get(id);
    for (const key of scopeChainOf(this.scopeKey).slice(1).reverse()) resolved = this.#layers.scoped.get(key)?.get(id) ?? resolved;
    return resolved;
  }

  #local(create: true): Map<string, RegistryEntry<T>>;
  #local(create: false): Map<string, RegistryEntry<T>> | undefined;
  #local(create: boolean): Map<string, RegistryEntry<T>> | undefined {
    if (this.scopeKey === undefined) return this.#layers.global;
    const existing = this.#layers.scoped.get(this.scopeKey);
    if (existing !== undefined || !create) return existing;
    const layer = new Map<string, RegistryEntry<T>>();
    this.#layers.scoped.set(this.scopeKey, layer);
    return layer;
  }
}
