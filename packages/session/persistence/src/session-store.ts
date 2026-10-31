import { SessionError, createSessionForkSeed, validateSessionEvents, type EventCodecRegistry, type CreateSessionHeaderInput, type SessionValidationResult, type SessionLineageOrigin } from "@actspace/session-journal";
import type { SessionStorage, SessionStorageHandle, SessionStorageSnapshot } from "@actspace/session-storage";
import { Service, type CordisServiceContext } from "@actspace/cordis-adapter";
import { SessionHandle } from "./session.js";
import { SessionPersistenceCoordinator } from "./coordinator.js";
import { createPersistedSessionHeader, type SessionForkArtifactPort, type SessionPersistenceCreateOptions, type SessionPersistenceOpenOptions } from "./session-persistence.js";

export type SessionStoreOptions = { readonly registry: EventCodecRegistry; readonly forkArtifacts?: SessionForkArtifactPort };
export type SessionInspection = SessionStorageSnapshot & {
  readonly validation: SessionValidationResult | null;
  readonly accessState: "read-write" | "degraded" | "browse-only" | "corrupt";
};

/** Business rules depend only on a Host-selected storage provider. */
export class SessionStore {
  constructor(readonly options: SessionStoreOptions, readonly storage: SessionStorage) {}

  async create(input: CreateSessionHeaderInput, options: SessionPersistenceCreateOptions = {}): Promise<SessionHandle> {
    const header = createPersistedSessionHeader(input, this.options.registry);
    if (options.seed) validateSessionEvents(options.seed, this.options.registry);
    const handle = await this.storage.create(header);
    try {
      if (options.seed?.length) await handle.append(options.seed);
      await handle.flush();
      return await this.bind(handle, options);
    } catch (error) { return this.cleanupFailure(error, [() => this.storage.discard(handle), () => handle.close()]); }
  }

  async inspect(sessionId: string): Promise<SessionInspection> {
    const snapshot = await this.storage.inspect(sessionId);
    let validation: SessionValidationResult | null = null;
    try { if (snapshot.header) validation = validateSessionEvents(snapshot.events, this.options.registry); } catch { /* Keep inspection available for diagnostics. */ }
    return { ...snapshot, validation, accessState: snapshot.integrity === "complete" && validation ? validation.accessState : "corrupt" };
  }

  listSessionIds(): Promise<readonly string[]> { return this.storage.listSessionIds(); }

  async open(sessionId: string, options: SessionPersistenceOpenOptions = {}): Promise<SessionHandle> {
    const handle = await this.storage.open(sessionId, "write");
    try { return await this.bind(handle, options); }
    catch (error) { return this.cleanupFailure(error, [() => handle.close()]); }
  }

  async fork(options: { readonly parentSessionId: string; readonly boundarySeq: number; readonly newSessionId: string; readonly createdAt: string; readonly createdWith: CreateSessionHeaderInput["createdWith"]; readonly origin?: SessionLineageOrigin }): Promise<SessionHandle> {
    const parent = await this.inspect(options.parentSessionId);
    if (!parent.header || !parent.validation || parent.integrity !== "complete") throw new SessionError("INVALID_FORK_BOUNDARY", "Parent session requires repair.");
    const seed = createSessionForkSeed({ parentHeader: parent.header, parentEvents: parent.events, registry: this.options.registry, ...options });
    if (options.createdWith.codecSetDigest !== this.options.registry.digest) throw new SessionError("INVALID_HEADER", "Fork codec digest mismatch.");
    // Reserve the child before copying artifacts, so duplicate IDs cannot erase another session.
    const handle = await this.storage.create(seed.header);
    const copied = new Map<string, string>();
    try {
      const rewrite = async (value: unknown): Promise<unknown> => {
        if (Array.isArray(value)) {
          const result: unknown[] = [];
          for (const item of value) result.push(await rewrite(item));
          return result;
        }
        if (value === null || typeof value !== "object") return value;
        const record = value as Record<string, unknown>;
        // Recognize typed artifact refs and LLM image blocks, never arbitrary text IDs.
        const artifactId = typeof record.artifactId === "string" &&
          (typeof record.mediaType === "string" || (record.type === "image" && typeof record.mimeType === "string"))
          ? record.artifactId : undefined;
        if (artifactId !== undefined && !copied.has(artifactId)) {
          if (!this.options.forkArtifacts) throw new Error("This Host cannot copy artifacts for a Session fork.");
          const ref = await this.options.forkArtifacts.copyForSession(options.parentSessionId, options.newSessionId, artifactId);
          copied.set(artifactId, ref.artifactId);
        }
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(record)) {
          result[key] = key === "artifactId" && artifactId !== undefined ? copied.get(artifactId)! : await rewrite(item);
        }
        return result;
      };
      const events = await rewrite(seed.events) as typeof seed.events;
      await handle.append(events);
      await handle.flush();
      return await this.bind(handle, {});
    } catch (error) {
      return this.cleanupFailure(error, [...[...copied.values()].map(id => () => this.options.forkArtifacts!.deleteForSession(options.newSessionId, id)), () => this.storage.discard(handle), () => handle.close()]);
    }
  }

  private async bind(handle: SessionStorageHandle, options: SessionPersistenceCreateOptions): Promise<SessionHandle> {
    const snapshot = await handle.read();
    const validation = validateSessionEvents(snapshot.events, this.options.registry);
    if (validation.accessState === "browse-only" || validation.accessState === "corrupt" || snapshot.integrity !== "complete") throw new SessionError("SESSION_BROWSE_ONLY", "Session is not writable.");
    const coordinator = new SessionPersistenceCoordinator(handle, snapshot.events, options.onBackgroundFailure);
    const report = options.onBackgroundFailure ?? (() => undefined);
    const notify = (event: import("@actspace/session-journal").SessionEventEnvelopeV1) => { void Promise.resolve().then(() => options.onEvent?.(event)).catch(report); };
    return SessionHandle.create({ header: handle.header, registry: this.options.registry, driver: handle, seed: snapshot.events, now: options.now,
      onEvent: async event => { await coordinator.accept(event); notify(event); },
      onEvents: async events => { await coordinator.acceptMany(events); events.forEach(notify); },
      onFlush: async seq => { await coordinator.flush(seq); await options.onFlush?.(seq); },
      onClose: seq => coordinator.close(seq), durableSeq: () => coordinator.durableSeq, durabilityBlocked: () => coordinator.blocked,
    });
  }

  private async cleanupFailure(error: unknown, cleanup: readonly (() => Promise<void>)[]): Promise<never> {
    const failures: unknown[] = [];
    for (const release of cleanup) { try { await release(); } catch (failure) { failures.push(failure); } }
    if (failures.length) throw new AggregateError([error, ...failures], "Session operation and cleanup failed.");
    throw error;
  }
}

/** Cordis-owned live-log service. The concrete persistence backend is injected. */
export class SessionStoreService extends Service {
  static inject = Object.freeze(["session.journal", "session.storage"]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Session store config must be an object." }] };
      },
    },
  };

  readonly store: SessionStore;

  constructor(ctx: CordisServiceContext, _config: Record<string, unknown> = {}) {
    super(ctx, "session.store");
    const journal = ctx.get("session.journal") as { readonly registry: EventCodecRegistry } | undefined;
    const persistence = ctx.get("session.storage") as SessionStorage | undefined;
    if (journal === undefined) throw new Error("Session Store Service requires session.journal.");
    if (persistence === undefined) throw new Error("Session Store Service requires session.storage.");
    this.store = new SessionStore({ registry: journal.registry, forkArtifacts: ctx.get("host.artifacts") as SessionForkArtifactPort | undefined }, persistence);
  }
}
