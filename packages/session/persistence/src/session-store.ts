import type { EventCodecRegistry } from "@actspace/session-journal";
import { SessionError } from "@actspace/session-journal";
import type { CreateSessionHeaderInput } from "@actspace/session-journal";
import type { SessionInspection } from "@actspace/session-jsonl";
import { SessionHandle } from "./session.js";
import { createJsonlSessionPersistence, createPersistedSessionHeader, type SessionPersistence, type SessionPersistenceCreateOptions, type SessionPersistenceOpenOptions } from "./session-persistence.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export type SessionStoreOptions = {
  readonly dataRoot: string;
  readonly runtimeId: string;
  readonly registry: EventCodecRegistry;
};

export class SessionStore {
  readonly persistence: SessionPersistence;

  constructor(readonly options: SessionStoreOptions, persistence?: SessionPersistence) {
    this.persistence = persistence ?? createJsonlSessionPersistence(options);
  }

  async create(
    headerInput: CreateSessionHeaderInput,
    options: SessionPersistenceCreateOptions = {},
  ): Promise<SessionHandle> {
    const header = createPersistedSessionHeader(headerInput, this.options.registry);
    const binding = await this.persistence.create(header, options);
    return SessionHandle.create({
      registry: this.options.registry,
      ...binding,
      seed: binding.events,
      now: options.now,
      onBackgroundFailure: options.onBackgroundFailure,
      onEvent: options.onEvent,
      onFlush: options.onFlush,
    });
  }

  async inspect(sessionId: string): Promise<SessionInspection> {
    return this.persistence.inspect(sessionId);
  }

  async listSessionIds(): Promise<readonly string[]> {
    return this.persistence.listSessionIds();
  }

  async fork(options: {
    readonly parentSessionId: string;
    readonly boundarySeq: number;
    readonly newSessionId: string;
    readonly createdAt: string;
    readonly createdWith: CreateSessionHeaderInput["createdWith"];
    readonly origin?: "fork" | "delegation";
  }): Promise<SessionHandle> {
    if (options.createdWith.codecSetDigest !== this.options.registry.digest) {
      throw new SessionError("INVALID_HEADER", "Fork codecSetDigest does not match the boot registry.");
    }
    const binding = await this.persistence.fork(options);
    return SessionHandle.create({ registry: this.options.registry, ...binding, seed: binding.events });
  }

  async open(sessionId: string, options: SessionPersistenceOpenOptions = {}): Promise<SessionHandle> {
    const binding = await this.persistence.open(sessionId, options);
    return SessionHandle.create({
      registry: this.options.registry,
      ...binding,
      seed: binding.events,
      now: options.now,
      onBackgroundFailure: options.onBackgroundFailure,
      onEvent: options.onEvent,
      onFlush: options.onFlush,
    });
  }
}

/** Cordis-owned live-log service. The concrete persistence backend is injected. */
export class SessionStoreService extends Service {
  static inject = Object.freeze(["actspace.host.session", "session.journal", "session.persistence"]);
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
    const host = ctx.get("actspace.host.session") as SessionStoreOptions | undefined;
    const journal = ctx.get("session.journal") as { readonly registry: EventCodecRegistry } | undefined;
    const persistence = ctx.get("session.persistence") as SessionPersistence | undefined;
    if (host === undefined) throw new Error("Session Store Service requires actspace.host.session.");
    if (journal === undefined) throw new Error("Session Store Service requires session.journal.");
    if (persistence === undefined) throw new Error("Session Store Service requires session.persistence.");
    this.store = new SessionStore({ ...host, registry: journal.registry }, persistence);
    ctx.effect(() => () => undefined, "session.store");
  }
}
