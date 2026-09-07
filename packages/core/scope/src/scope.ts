import { randomUUID } from "node:crypto";
import { ScopeDisposer } from "./disposer.js";
import { ScopedRegistry } from "./layered-registry.js";
import { CordisContextClass, type CordisContext } from "@actspace/cordis-adapter";

/** Opaque, identity-compared key used for live scope routing. */
export type ScopeKey = object;

const scopeParents = new WeakMap<ScopeKey, ScopeKey>();
const activeScopeKeys = new WeakSet<ScopeKey>();
const scopeDisposers = new WeakMap<ScopeKey, ScopeDisposer>();
const scopeTag = Symbol("actspace.scope");

export interface ScopeParentBinding {
  rebind(parent: ScopeKey): void;
}

function linkScopeParent(key: ScopeKey, parent: ScopeKey): void {
  for (let cursor: ScopeKey | undefined = parent; cursor !== undefined; cursor = scopeParents.get(cursor)) {
    if (cursor === key) throw new Error("Scope parent link would form a cycle.");
  }
  scopeParents.set(key, parent);
}

export function bindScopeParent(key: ScopeKey, parent: ScopeKey): ScopeParentBinding {
  if (scopeParents.has(key)) throw new Error("Scope key is already bound to a parent.");
  linkScopeParent(key, parent);
  return { rebind: (next) => linkScopeParent(key, next) };
}

export function scopeParentOf(key: ScopeKey): ScopeKey | undefined { return scopeParents.get(key); }

export function scopeChainOf(key: ScopeKey | undefined): ScopeKey[] {
  const chain: ScopeKey[] = [];
  for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) chain.push(cursor);
  return chain;
}

/** Test whether a live scope key can still receive new routed work. */
export function scopeActiveOf(key: ScopeKey | undefined): boolean {
  if (key === undefined) return true;
  const disposer = scopeDisposers.get(key);
  return activeScopeKeys.has(key) && (disposer === undefined || disposer.state === "active");
}

/** Read the opaque scope tag carried by a Cordis context. */
export function scopeOf(context: CordisContext): ScopeKey | undefined {
  return (context as CordisContext & { readonly [scopeTag]?: ScopeKey })[scopeTag];
}

const carrierKeys = new WeakMap<object, ScopeKey | undefined>();

/** Test whether a value was created by {@link scopeTarget}. */
export function isScopeCarrier(value: unknown): value is object {
  return typeof value === "object" && value !== null && carrierKeys.has(value);
}

/**
 * Build a Cordis dispatch receiver for one scope. Cordis uses the receiver's
 * `Context.filter` predicate to admit listeners owned by the same scope or an
 * ancestor scope; untagged listeners remain global observers.
 */
export function scopeTarget<T extends object>(base: T, key: ScopeKey | undefined): T {
  const baseFilter = (base as T & { [CordisContextClass.filter]?: (ctx: CordisContext) => boolean })[CordisContextClass.filter];
  const carrier = {
    [CordisContextClass.filter](ctx: CordisContext): boolean {
      if (baseFilter !== undefined && !baseFilter.call(base, ctx)) return false;
      if (key !== undefined && !scopeActiveOf(key)) return false;
      const tagged = scopeOf(ctx);
      if (tagged === undefined) return true;
      for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) {
        if (!scopeActiveOf(cursor)) return false;
        if (cursor === tagged) return true;
      }
      return false;
    },
  } as T;
  carrierKeys.set(carrier, key);
  return carrier;
}

export function carrierKeyOf(value: unknown): ScopeKey | undefined { return isScopeCarrier(value) ? carrierKeys.get(value) : undefined; }

/** Tag a Cordis context with this scope for listener admission checks. */
export function scopeContext(context: CordisContext, key: ScopeKey, ownerDisposer?: ScopeDisposer): CordisContext {
  const tagged = context.extend?.({ [scopeTag]: key }) ?? context;
  if (ownerDisposer === undefined || typeof tagged.on !== "function") return tagged;

  const wrapRegistration = (method: "on" | "once") => (...args: readonly unknown[]): unknown => {
    if (!scopeActiveOf(key)) throw new Error("Scope is already disposed.");
    const register = tagged[method] as ((...values: readonly unknown[]) => unknown);
    const remove = register(...args);
    if (typeof remove !== "function") return remove;
    let active = true;
    let cancel: (() => void) | undefined;
    try {
      cancel = ownerDisposer.add(() => {
        if (!active) return;
        active = false;
        remove();
      });
    } catch (error) {
      remove();
      throw error;
    }
    return () => {
      if (!active) return false;
      active = false;
      cancel?.();
      return remove();
    };
  };

  return tagged.extend?.({
    on: wrapRegistration("on"),
    once: wrapRegistration("once"),
  }) ?? tagged;
}

export type ScopeIdentity = { readonly scopeId: string; readonly parentScopeId: string | null; readonly agentId: string; readonly lineage: readonly string[] };

export class AgentScope {
  readonly scopeKey: ScopeKey;
  readonly identity: ScopeIdentity;
  readonly disposer = new ScopeDisposer();
  readonly contributors: ScopedRegistry<unknown>;
  readonly tools: ScopedRegistry<unknown>;

  constructor(readonly agentId: string, readonly parent?: AgentScope, scopeId: string = randomUUID() as string) {
    parent?.assertActive();
    this.scopeKey = Object.freeze({});
    activeScopeKeys.add(this.scopeKey);
    scopeDisposers.set(this.scopeKey, this.disposer);
    if (parent !== undefined) bindScopeParent(this.scopeKey, parent.scopeKey);
    this.contributors = parent === undefined
      ? new ScopedRegistry<unknown>().forScope(this.scopeKey, this.disposer)
      : parent.contributors.forScope(this.scopeKey, this.disposer);
    this.tools = parent === undefined
      ? new ScopedRegistry<unknown>().forScope(this.scopeKey, this.disposer)
      : parent.tools.forScope(this.scopeKey, this.disposer);
    this.identity = Object.freeze({ scopeId, parentScopeId: parent?.identity.scopeId ?? null, agentId, lineage: Object.freeze([...parent?.identity.lineage ?? [], agentId]) });
  }

  /** Create an explicitly flat child that has no parent registry/event inheritance. */
  isolatedChild(agentId: string, scopeId?: string): AgentScope {
    this.assertActive();
    return new AgentScope(agentId, undefined, scopeId);
  }

  child(agentId: string, scopeId?: string): AgentScope {
    this.assertActive();
    const child = new AgentScope(agentId, this, scopeId);
    this.disposer.add(() => child.dispose());
    return child;
  }

  assertActive(): void { if (this.disposer.state !== "active") throw new Error(`Scope ${this.identity.scopeId} is disposed.`); }

  async dispose(): Promise<void> {
    activeScopeKeys.delete(this.scopeKey);
    await this.disposer.dispose();
  }
}
