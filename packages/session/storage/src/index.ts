import type { SessionHeaderV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";

/** Opaque revision: compare only within one storage identity and session. */
export interface SessionStorageSnapshot {
  readonly revision: string;
  readonly header: SessionHeaderV1 | null;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly integrity: "complete" | "repair-required";
  readonly problem?: string;
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
  inspect(sessionId: string): Promise<SessionStorageSnapshot>;
  listSessionIds(): Promise<readonly string[]>;
  create(header: SessionHeaderV1): Promise<SessionStorageHandle>;
  open(sessionId: string, access: "read" | "write"): Promise<SessionStorageHandle>;
  /** Remove only a session for which this caller currently owns a write handle. */
  discard(handle: SessionStorageHandle): Promise<void>;
  close(): Promise<void>;
}
