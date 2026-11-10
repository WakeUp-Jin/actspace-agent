import type { SessionHeaderV1, SessionEventEnvelopeV1, SessionEventCandidateV1, SessionAccessState, SessionValidationResult } from "@actspace/session-journal";

/** Opaque revision: compare only within one storage identity and session. */
export interface SessionStorageSnapshot {
  readonly revision: string;
  readonly header: SessionHeaderV1 | null;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly integrity: "complete" | "repair-required";
  readonly problem?: string;
  /** Physical size of the Journal this snapshot reflects; consumers use it only to estimate retention cost. */
  readonly bytes?: number;
  /** Validation the provider already ran over exactly `events`. Valid only for the codec set whose digest matches; otherwise re-validate. */
  readonly validated?: { readonly codecDigest: string; readonly accessState: SessionAccessState; readonly result: SessionValidationResult };
}

/** Result of `SessionStorage.refresh`: how the physical Journal relates to the base snapshot. */
export type SessionStorageRefresh =
  /** Nothing changed; `snapshot` is the base object itself. Deciding this reads at most a bounded amount of Journal content, never the whole file. */
  | { readonly kind: "unchanged"; readonly snapshot: SessionStorageSnapshot }
  /** The Journal only grew. `snapshot.events` starts with all of the base events; events from index `fromEvent` are new. */
  | { readonly kind: "appended"; readonly snapshot: SessionStorageSnapshot; readonly fromEvent: number }
  /** Anything else (rewrite, truncation, repair, new file identity, torn tail): a full, independent read. */
  | { readonly kind: "replaced"; readonly snapshot: SessionStorageSnapshot };

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
  /** Optional direct file history for releasing durable event bodies from a live Journal. */
  readonly history?: import("@actspace/session-journal").SessionEventHistory;
  append(events: readonly SessionEventEnvelopeV1[]): Promise<void>;
  flush(): Promise<void>;
  assertOwned(): Promise<void>;
  close(): Promise<void>;
}

/** Keep the Journal before `cutSeq`, append `closing` after it, and archive the old file (agent-edit-resend-rewind.md §3.4). */
export interface SessionPrefixRewrite {
  /** The rewrite refuses a Journal whose last seq differs: something wrote after the caller decided the cut. */
  readonly expectedLastSeq: number;
  /** First seq dropped; events before it are kept byte-for-byte. */
  readonly cutSeq: number;
  /** Appended after the prefix; the provider assigns seq and time and validates them. */
  readonly closing: readonly SessionEventCandidateV1[];
  /** Path-safe name shared by the archive file and retired child directories. */
  readonly label: string;
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
  /** Optional acceleration: bring a snapshot previously returned by `inspect`/`refresh` up to date without
   * re-reading unchanged content. Must be observably equivalent to a fresh `inspect` (same events, integrity and problem).
   * Providers without cheap change detection omit it and callers fall back to `inspect`. */
  refresh?(sessionId: string, base: SessionStorageSnapshot): Promise<SessionStorageRefresh>;
  listSessionIds(): Promise<readonly string[]>;
  create(header: SessionHeaderV1): Promise<SessionStorageHandle>;
  open(sessionId: string, access: "read" | "write"): Promise<SessionStorageHandle>;
  /** Remove only a session for which this caller currently owns a write handle. */
  discard(handle: SessionStorageHandle): Promise<void>;
  /** Rewrite a closed Session to a prefix. Fails when another writer holds it. Returns the archive path relative to the Session. */
  rewritePrefix?(sessionId: string, input: SessionPrefixRewrite): Promise<{ readonly archive: string }>;
  /** Move a closed Session out of the catalog into `parentSessionId`'s recovery area. */
  retireInto?(sessionId: string, parentSessionId: string, label: string): Promise<void>;
  close(): Promise<void>;
}
