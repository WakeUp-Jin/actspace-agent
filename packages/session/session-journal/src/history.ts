import type { SessionEventEnvelopeV1 } from "./event-envelope.js";

/** Host-owned authoritative history. Reads are explicit; implementations never consult SQLite. */
export interface SessionEventHistory {
  /** Inclusive start, exclusive end; must return every requested sequence or throw. */
  readEvents(start: number, end: number): readonly SessionEventEnvelopeV1[];
}
