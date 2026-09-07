import type { RuntimeV2ProjectionKey } from "@actspace/shared/runtime-v2";
import type { ProjectionCheckpointRow } from "./checkpoint.js";

export type ProjectionRestoreFloor = {
  readonly sessionId: string;
  readonly projectionKey: RuntimeV2ProjectionKey;
  readonly stateVersion: number;
  readonly throughJournalSeq: number;
};

export type RestoreCheckpointResult =
  | { readonly kind: "miss"; readonly reason: "missing" | "session-mismatch" | "projection-mismatch" | "state-version" | "journal-shortened" | "invalid-seq" }
  | { readonly kind: "hit"; readonly checkpoint: ProjectionCheckpointRow; readonly restoreFloor: ProjectionRestoreFloor };

export function validateCheckpoint(
  checkpoint: ProjectionCheckpointRow | null,
  expected: ProjectionRestoreFloor,
  journalEndSeq: number,
): RestoreCheckpointResult {
  if (checkpoint === null) return { kind: "miss", reason: "missing" };
  if (checkpoint.sessionId !== expected.sessionId) return { kind: "miss", reason: "session-mismatch" };
  if (checkpoint.projectionKey !== expected.projectionKey) return { kind: "miss", reason: "projection-mismatch" };
  if (checkpoint.stateVersion !== expected.stateVersion) return { kind: "miss", reason: "state-version" };
  if (checkpoint.throughJournalSeq < -1 || checkpoint.throughJournalSeq > journalEndSeq) return { kind: "miss", reason: checkpoint.throughJournalSeq > journalEndSeq ? "journal-shortened" : "invalid-seq" };
  return Object.freeze({ kind: "hit", checkpoint, restoreFloor: Object.freeze({ ...expected, throughJournalSeq: checkpoint.throughJournalSeq }) });
}
