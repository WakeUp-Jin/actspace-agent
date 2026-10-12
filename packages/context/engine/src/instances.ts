import { randomUUID } from "node:crypto";
import type { Context, ContextIdentity, ContextInstanceSnapshot } from "./types.js";
import { freezeRequest } from "./request-snapshot.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

const DEFAULT_LOGICAL_SCOPE = "main";

type Entry = {
  readonly identity: ContextIdentity;
  revision: number;
  digest: string;
  activeBindings: number;
  view: Context;
};

/**
 * Owns the in-memory lifetime of Context states. A Context is keyed by the
 * durable Session and a stable logical Agent identity, never by request or
 * runtime scope ids. State is replaced through commit so callers cannot mutate
 * the registry's copy while LlmInput conversion is in flight.
 */
export class ContextInstanceRegistry {
  readonly #entries = new Map<string, Entry>();
  readonly #queues = new Map<string, Promise<void>>();

  /** Serialize commits for one logical Context while allowing other keys to proceed. */
  async commit(context: Context, logicalAgentScopeId = context.request.logicalAgentScopeId ?? DEFAULT_LOGICAL_SCOPE): Promise<Context> {
    const key = identityKey(contextIdentity(context.request.sessionId, logicalAgentScopeId));
    const prior = this.#queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>(resolve => { release = resolve; });
    const chain = prior.then(() => turn);
    this.#queues.set(key, chain);
    await prior;
    try { return this.acquire(context, logicalAgentScopeId); }
    finally {
      release();
      if (this.#queues.get(key) === chain) this.#queues.delete(key);
    }
  }

  acquire(context: Context, logicalAgentScopeId = context.request.logicalAgentScopeId ?? DEFAULT_LOGICAL_SCOPE): Context {
    const identity = contextIdentity(context.request.sessionId, logicalAgentScopeId);
    const key = identityKey(identity);
    const previous = this.#entries.get(key);
    // A late async source may finish with an older Journal watermark. Keep the
    // newest committed state while still binding the caller's request metadata.
    const assembled = previous !== undefined && context.status.throughJournalSeq < previous.view.status.throughJournalSeq
      ? { ...previous.view, request: context.request }
      : context;
    const inheritedModel = previous?.view.request.model === assembled.request.model && previous?.view.request.routeId === assembled.request.routeId ? previous?.view.status.requestModel : undefined;
    const candidate = { ...assembled, status: { ...assembled.status, ...(assembled.status.requestModel || !inheritedModel ? {} : { requestModel: inheritedModel }) } };
    const digest = stateDigest(candidate);
    const revision = previous === undefined ? 1 : previous.digest === digest ? previous.revision : previous.revision + 1;
    const view = freezeRequest({
      ...candidate,
      request: { ...candidate.request, logicalAgentScopeId: identity.logicalAgentScopeId },
      status: { ...candidate.status, instanceGeneration: previous?.view.status.instanceGeneration ?? randomUUID(),
        ...(candidate.status.requestModel ? {} : previous?.view.request.model === candidate.request.model && previous?.view.request.routeId === candidate.request.routeId && previous?.view.status.requestModel ? { requestModel: previous.view.status.requestModel } : {}), contextRevision: revision, logicalAgentScopeId: identity.logicalAgentScopeId },
    } as unknown as RuntimeV2JsonValue) as unknown as Context;
    const entry: Entry = previous ?? { identity, revision, digest, activeBindings: 0, view };
    entry.revision = revision;
    entry.digest = digest;
    entry.view = view;
    this.#entries.set(key, entry);
    return view;
  }

  bind(sessionId: string, logicalAgentScopeId = DEFAULT_LOGICAL_SCOPE): ContextInstanceSnapshot | undefined {
    const entry = this.#entries.get(identityKey(contextIdentity(sessionId, logicalAgentScopeId)));
    if (entry === undefined) return undefined;
    entry.activeBindings += 1;
    return snapshot(entry);
  }

  release(sessionId: string, logicalAgentScopeId = DEFAULT_LOGICAL_SCOPE): ContextInstanceSnapshot | undefined {
    const entry = this.#entries.get(identityKey(contextIdentity(sessionId, logicalAgentScopeId)));
    if (entry === undefined) return undefined;
    entry.activeBindings = Math.max(0, entry.activeBindings - 1);
    return snapshot(entry);
  }

  get(sessionId: string, logicalAgentScopeId = DEFAULT_LOGICAL_SCOPE): ContextInstanceSnapshot | undefined {
    const entry = this.#entries.get(identityKey(contextIdentity(sessionId, logicalAgentScopeId)));
    return entry === undefined ? undefined : snapshot(entry);
  }

  evict(sessionId: string, logicalAgentScopeId = DEFAULT_LOGICAL_SCOPE): boolean {
    const key = identityKey(contextIdentity(sessionId, logicalAgentScopeId));
    const entry = this.#entries.get(key);
    if (entry === undefined) return false;
    if (entry.activeBindings > 0) throw new Error("Cannot evict a Context instance with active bindings.");
    return this.#entries.delete(key);
  }

  clear(): void {
    for (const entry of this.#entries.values()) if (entry.activeBindings > 0) throw new Error("Cannot clear Context instances with active bindings.");
    this.#entries.clear();
  }

  get size(): number { return this.#entries.size; }
}

export function contextIdentity(sessionId: string, logicalAgentScopeId = DEFAULT_LOGICAL_SCOPE): ContextIdentity {
  if (!sessionId) throw new Error("Context identity requires a Session id.");
  if (!logicalAgentScopeId) throw new Error("Context identity requires a logical Agent scope id.");
  return Object.freeze({ sessionId, logicalAgentScopeId });
}

function identityKey(identity: ContextIdentity): string { return `${identity.sessionId}\u0000${identity.logicalAgentScopeId}`; }

function stateDigest(context: Context): string {
  const { request: _request, status, ...state } = context;
  const { contextRevision: _revision, instanceGeneration: _generation, logicalAgentScopeId: _scope, ...stableStatus } = status;
  return JSON.stringify({ ...state, status: stableStatus });
}

function snapshot(entry: Entry): ContextInstanceSnapshot {
  return Object.freeze({ identity: entry.identity, revision: entry.revision, activeBindings: entry.activeBindings, view: entry.view });
}
