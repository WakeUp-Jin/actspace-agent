import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { EventCodecRegistry, CreateSessionHeaderInput, SessionHeaderV1 } from "@actspace/session-journal";
import { SessionError, createSessionForkSeed, createSessionHeader } from "@actspace/session-journal";
import { inspectJsonlSession, type SessionInspection } from "@actspace/session-jsonl";
import { JsonlSessionWriter, type JsonlWriterHooks } from "@actspace/session-jsonl";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";
import { mkdir } from "node:fs/promises";
import { sessionFileLayout, type SessionFileLayout } from "./session.js";
import type { SessionPersistenceDriver } from "./session-driver.js";
import { SessionWriterLease, type AcquireWriterLeaseOptions } from "./writer-lease.js";

export type SessionPersistenceOptions = {
  readonly dataRoot: string;
  readonly runtimeId: string;
  readonly registry: EventCodecRegistry;
  readonly forkArtifacts?: SessionForkArtifactPort;
};

export type SessionForkArtifactPort = {
  copyForSession(parentSessionId: string, childSessionId: string, artifactId: string): Promise<{ readonly artifactId: string }>;
  deleteForSession(sessionId: string, artifactId: string): Promise<void>;
};

export type SessionPersistenceCreateOptions = {
  readonly seed?: readonly import("@actspace/session-journal").SessionEventEnvelopeV1[];
  readonly writerHooks?: JsonlWriterHooks;
  readonly lease?: Pick<AcquireWriterLeaseOptions, "heartbeatMs" | "staleMs" | "now" | "isProcessAlive" | "pid">;
  readonly now?: () => string;
  readonly onBackgroundFailure?: (error: unknown) => void;
  readonly onEvent?: (event: import("@actspace/session-journal").SessionEventEnvelopeV1) => void | Promise<void>;
  readonly onFlush?: (throughSeq: number) => void | Promise<void>;
};
export type SessionPersistenceOpenOptions = SessionPersistenceCreateOptions;
export type SessionPersistenceFactory = (options: SessionPersistenceOptions) => SessionPersistence;
export type SessionPersistenceHostPort = Pick<SessionPersistenceOptions, "dataRoot" | "runtimeId">;

export type SessionPersistenceBinding = {
  readonly header: SessionHeaderV1;
  readonly layout: SessionFileLayout;
  readonly events: readonly import("@actspace/session-journal").SessionEventEnvelopeV1[];
  readonly driver: SessionPersistenceDriver;
};

/**
 * Durable Session provider seam. SessionStore owns the live-log contract;
 * providers own files, leases and recovery artifacts behind this interface.
 */
export interface SessionPersistence {
  readonly create: (header: SessionHeaderV1, options?: SessionPersistenceCreateOptions) => Promise<SessionPersistenceBinding>;
  readonly inspect: (sessionId: string) => Promise<SessionInspection>;
  readonly listSessionIds: () => Promise<readonly string[]>;
  readonly fork: (options: {
    readonly parentSessionId: string;
    readonly boundarySeq: number;
    readonly newSessionId: string;
    readonly createdAt: string;
    readonly createdWith: CreateSessionHeaderInput["createdWith"];
    readonly origin?: "fork" | "delegation";
  }) => Promise<SessionPersistenceBinding>;
  readonly open: (sessionId: string, options?: SessionPersistenceOpenOptions) => Promise<SessionPersistenceBinding>;
}

/** Current JSONL provider. Its writer/recovery algorithms remain unchanged. */
export class JsonlSessionPersistence implements SessionPersistence {
  constructor(readonly options: SessionPersistenceOptions) {}

  async create(header: SessionHeaderV1, options: SessionPersistenceCreateOptions = {}): Promise<SessionPersistenceBinding> {
    const layout = sessionFileLayout(this.options.dataRoot, header.sessionId);
    await mkdir(layout.artifactsDir, { recursive: true });
    await mkdir(layout.recoveryDir, { recursive: true });
    const lease = await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: header.sessionId, runtimeId: this.options.runtimeId, ...options.lease });
    let writer: JsonlSessionWriter | undefined;
    try {
      writer = await JsonlSessionWriter.create(layout.journalPath, header, options.writerHooks);
      const seed = options.seed ?? [];
      if (seed.length > 0) await writer.append(seed);
      return { header, layout, events: Object.freeze([...seed]), driver: createJsonlDriver(writer, lease) };
    } catch (error) {
      try { await writer?.close(); } finally { await lease.dispose(); }
      throw error;
    }
  }

  async inspect(sessionId: string): Promise<SessionInspection> {
    const layout = sessionFileLayout(this.options.dataRoot, sessionId);
    return inspectJsonlSession(layout.journalPath, this.options.registry, sessionId);
  }

  async listSessionIds(): Promise<readonly string[]> {
    const root = join(this.options.dataRoot, "sessions-v2");
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    return Object.freeze(entries
      .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort());
  }

  async fork(options: {
    readonly parentSessionId: string;
    readonly boundarySeq: number;
    readonly newSessionId: string;
    readonly createdAt: string;
    readonly createdWith: CreateSessionHeaderInput["createdWith"];
    readonly origin?: "fork" | "delegation";
  }): Promise<SessionPersistenceBinding> {
    const parent = await this.inspect(options.parentSessionId);
    if (parent.header === null || parent.validation === null || parent.tornTail !== null) {
      throw new SessionError("INVALID_FORK_BOUNDARY", "Parent Session is not a validated complete prefix.");
    }
    const seed = createSessionForkSeed({
      parentHeader: parent.header,
      parentEvents: parent.events,
      boundarySeq: options.boundarySeq,
      newSessionId: options.newSessionId,
      createdAt: options.createdAt,
      createdWith: options.createdWith,
      registry: this.options.registry,
      origin: options.origin,
    });
    // Reserve only this new directory; an existing Session must never be cleaned up.
    const layout = sessionFileLayout(this.options.dataRoot, options.newSessionId);
    await mkdir(layout.root, { recursive: true });
    await mkdir(layout.sessionDir);
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
      return await this.create(seed.header, { seed: events });
    } catch (error) {
      const cleanup = await Promise.allSettled([
        ...[...copied.values()].map(id => this.options.forkArtifacts!.deleteForSession(options.newSessionId, id)),
        rm(layout.sessionDir, { recursive: true, force: true }),
      ]);
      const failures = cleanup.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) throw new AggregateError([error, ...failures.map(result => result.reason)], "Session fork failed and cleanup was incomplete.");
      throw error;
    }
  }

  async open(sessionId: string, options: SessionPersistenceOpenOptions = {}): Promise<SessionPersistenceBinding> {
    const inspection = await this.inspect(sessionId);
    if (inspection.header === null || inspection.validation === null || inspection.tornTail !== null) {
      throw new SessionError("SESSION_CORRUPT", `Session ${sessionId} requires forensic repair before it can be opened.`);
    }
    if (inspection.accessState === "browse-only" || inspection.accessState === "corrupt") {
      throw new SessionError("SESSION_BROWSE_ONLY", `Session ${sessionId} is ${inspection.accessState}.`);
    }
    const layout = sessionFileLayout(this.options.dataRoot, inspection.header.sessionId);
    const lease = await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: inspection.header.sessionId, runtimeId: this.options.runtimeId, ...options.lease });
    try {
      const writer = await JsonlSessionWriter.open(layout.journalPath, options.writerHooks);
      return { header: inspection.header, layout, events: inspection.events, driver: createJsonlDriver(writer, lease) };
    } catch (error) {
      await lease.dispose();
      throw error;
    }
  }
}

/** Cordis-owned provider that publishes the JSONL implementation as a seam. */
export class JsonlSessionPersistenceService extends Service implements SessionPersistence {
  static inject = Object.freeze(["actspace.host.session", "session.journal"]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Session persistence config must be an object." }] };
      },
    },
  };

  readonly provider: SessionPersistence;

  constructor(ctx: CordisServiceContext, _config: Record<string, unknown> = {}) {
    super(ctx, "session.persistence");
    const host = ctx.get("actspace.host.session") as SessionPersistenceHostPort | undefined;
    const journal = ctx.get("session.journal") as { readonly registry: EventCodecRegistry } | undefined;
    if (host === undefined) throw new Error("Session Persistence Service requires actspace.host.session.");
    if (journal === undefined) throw new Error("Session Persistence Service requires session.journal.");
    const artifacts = ctx.get("host.artifacts") as Partial<SessionForkArtifactPort> | undefined;
    const forkArtifacts = typeof artifacts?.copyForSession === "function" && typeof artifacts.deleteForSession === "function"
      ? artifacts as SessionForkArtifactPort : undefined;
    this.provider = createJsonlSessionPersistence({ ...host, registry: journal.registry, forkArtifacts });
    ctx.effect(() => () => undefined, "session.persistence.provider");
  }

  create(header: SessionHeaderV1, options: SessionPersistenceCreateOptions = {}): Promise<SessionPersistenceBinding> { return this.provider.create(header, options); }
  inspect(sessionId: string): Promise<SessionInspection> { return this.provider.inspect(sessionId); }
  listSessionIds(): Promise<readonly string[]> { return this.provider.listSessionIds(); }
  fork(options: Parameters<SessionPersistence["fork"]>[0]): Promise<SessionPersistenceBinding> { return this.provider.fork(options); }
  open(sessionId: string, options: SessionPersistenceOpenOptions = {}): Promise<SessionPersistenceBinding> { return this.provider.open(sessionId, options); }
}

function createJsonlDriver(writer: JsonlSessionWriter, lease: SessionWriterLease): SessionPersistenceDriver {
  return Object.freeze({
    append: async (events: readonly import("@actspace/session-journal").SessionEventEnvelopeV1[]) => {
      await lease.assertOwned();
      await writer.append(events);
    },
    assertOwned: () => lease.assertOwned(),
    close: async () => {
      let failure: unknown;
      try { await writer.close(); } catch (error) { failure = error; }
      try { await lease.dispose(); } catch (error) { failure ??= error; }
      if (failure !== undefined) throw failure;
    },
  });
}

/** Factory kept at the provider boundary for tests and future backends. */
export function createJsonlSessionPersistence(options: SessionPersistenceOptions): SessionPersistence {
  return new JsonlSessionPersistence(options);
}

/** Build/validate a header before handing it to a provider. */
export function createPersistedSessionHeader(input: CreateSessionHeaderInput, registry: EventCodecRegistry) {
  const header = createSessionHeader(input);
  if (header.createdWith.codecSetDigest !== registry.digest) {
    throw new SessionError("INVALID_HEADER", "Header codecSetDigest does not match the boot registry.");
  }
  return header;
}
