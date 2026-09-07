import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue, RuntimeV2ProjectionKey } from "@actspace/shared/runtime-v2";
import { type ProjectionCheckpointRow, type ProjectionCheckpointStore, freezeRow } from "./checkpoint.js";
import { validateCheckpoint, type ProjectionRestoreFloor, type RestoreCheckpointResult } from "./restore-floor.js";

export type ColdRestoreOptions<Value extends RuntimeV2JsonValue> = {
  readonly sessionId: string;
  readonly projectionKey: RuntimeV2ProjectionKey;
  readonly stateVersion: number;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly store: ProjectionCheckpointStore;
  readonly replay: (seed: Value | null, tail: readonly SessionEventEnvelopeV1[]) => Value;
};

export type ColdRestoreResult<Value extends RuntimeV2JsonValue> = {
  readonly value: Value;
  readonly throughJournalSeq: number;
  readonly cache: RestoreCheckpointResult;
};

/** Restore from a validated checkpoint and Journal tail, or replay from seq 0. */
export async function coldRestore<Value extends RuntimeV2JsonValue>(options: ColdRestoreOptions<Value>): Promise<ColdRestoreResult<Value>> {
  validateEvents(options.events);
  const expected: ProjectionRestoreFloor = { sessionId: options.sessionId, projectionKey: options.projectionKey, stateVersion: options.stateVersion, throughJournalSeq: -1 };
  const checkpoint = await options.store.read(options.sessionId, options.projectionKey);
  const throughJournalSeq = options.events.length === 0 ? -1 : (options.events[options.events.length - 1]?.seq ?? -1);
  const cache = validateCheckpoint(checkpoint, expected, throughJournalSeq);
  const seed = cache.kind === "hit" ? cache.checkpoint.value as Value : null;
  const floor = cache.kind === "hit" ? cache.checkpoint.throughJournalSeq : -1;
  const tail = options.events.filter((event) => event.seq > floor);
  const value = options.replay(seed, tail);
  return Object.freeze({ value, throughJournalSeq, cache });
}

export async function writeCheckpoint(options: {
  readonly store: ProjectionCheckpointStore;
  readonly sessionId: string;
  readonly projectionKey: RuntimeV2ProjectionKey;
  readonly stateVersion: number;
  readonly throughJournalSeq: number;
  readonly value: RuntimeV2JsonValue;
}): Promise<ProjectionCheckpointRow> {
  const row = freezeRow({ sessionId: options.sessionId, projectionKey: options.projectionKey, stateVersion: options.stateVersion, throughJournalSeq: options.throughJournalSeq, value: options.value });
  await options.store.write(row);
  return row;
}

function validateEvents(events: readonly SessionEventEnvelopeV1[]): void {
  for (let index = 0; index < events.length; index += 1) if (events[index]!.seq !== index) throw new Error(`Projection cache Journal must be contiguous at seq ${index}.`);
}
