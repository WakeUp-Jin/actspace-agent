import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

/**
 * Backend-neutral write capability owned by Session Persistence.
 *
 * Session Core only sees this small durability boundary. Implementations may
 * use JSONL, an in-memory buffer, or a future backend, but must not expose
 * their writer/lease classes through this contract.
 */
export interface SessionPersistenceDriver {
  append(events: readonly SessionEventEnvelopeV1[]): Promise<void>;
  assertOwned(): Promise<void>;
  close(): Promise<void>;
}
