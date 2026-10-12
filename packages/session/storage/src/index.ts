import type { SessionHeaderV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";

/** Opaque revision: compare only within one storage identity and session. */
export interface SessionStorageSnapshot {
  readonly revision: string;
  readonly header: SessionHeaderV1 | null;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly integrity: "complete" | "repair-required";
  readonly problem?: string;
}

/** Lightweight physical descriptor; metadata projection remains the consumer's job. */
export interface SessionQuerySource {
  readonly header: Pick<SessionHeaderV1, "sessionId" | "createdAt" | "cwd" | "worktree" | "lineage"> & {
    readonly createdWith: Pick<SessionHeaderV1["createdWith"], "profileId" | "presetId" | "initialAgentMode">;
  };
  readonly throughSeq: number;
  readonly stamp: string;
  /** Consumer decoding identity, independent of append-only physical growth. */
  readonly codecSetDigest?: string;
  /** Provider verified this physical version belongs to one owned append-only writer epoch.
   * Runtime may use it only while holding the live durable Session boundary. */
  readonly appendOnlyToken?: string;
}

/** Runtime inventory keeps unreadable sources explicit without hiding healthy Sessions. */
export interface SessionQueryCatalog {
  readonly sources: readonly SessionQuerySource[];
  readonly failedSessionIds: readonly string[];
}

/** Bounded query-only read. Cursor is opaque and scoped to one provider/session.
 * No recovery or write semantics depend on this optional acceleration capability. */
export interface SessionEventBatch {
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly cursor: string;
  readonly done: boolean;
}
export interface SessionEventBatchInput {
  /** Optional projection filter; cursor still advances across every physical event. */
  readonly eventTypes?: readonly string[];
  readonly cursor?: string;
  readonly throughSeq: number;
}

/** A consistent read snapshot, or a single-owner writer. close always releases ownership. */
export interface SessionStorageHandle {
  readonly header: SessionHeaderV1;
  readonly access: "read" | "write";
  read(): Promise<SessionStorageSnapshot>;
  append(events: readonly SessionEventEnvelopeV1[]): Promise<void>;
  flush(): Promise<void>;
  assertOwned(): Promise<void>;
  close(): Promise<void>;
}

/** Host-owned physical storage. Business recovery and fork belong to SessionStore. */
export interface SessionStorage {
  readonly identity: symbol;
  /** Optional physical history reference; callers must still enforce read permissions. */
  journalPath?(sessionId: string): string;
  querySources?(sessionIds: readonly string[]): Promise<readonly SessionQuerySource[]>;
  querySource?(sessionId: string): Promise<SessionQuerySource>;
  readEventBatch?(sessionId: string, input: SessionEventBatchInput): Promise<SessionEventBatch>;
  inspect(sessionId: string): Promise<SessionStorageSnapshot>;
  listSessionIds(): Promise<readonly string[]>;
  create(header: SessionHeaderV1): Promise<SessionStorageHandle>;
  open(sessionId: string, access: "read" | "write"): Promise<SessionStorageHandle>;
  /** Remove only a session for which this caller currently owns a write handle. */
  discard(handle: SessionStorageHandle): Promise<void>;
  close(): Promise<void>;
}
