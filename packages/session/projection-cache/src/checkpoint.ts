import type { RuntimeV2JsonValue, RuntimeV2ProjectionKey } from "@actspace/shared/runtime-v2";

export type ProjectionCheckpointRow = {
  readonly sessionId: string;
  readonly projectionKey: RuntimeV2ProjectionKey;
  readonly stateVersion: number;
  readonly throughJournalSeq: number;
  readonly value: RuntimeV2JsonValue;
};

export interface ProjectionCheckpointStore {
  read(sessionId: string, projectionKey: RuntimeV2ProjectionKey): Promise<ProjectionCheckpointRow | null>;
  write(row: ProjectionCheckpointRow): Promise<void>;
  delete(sessionId: string, projectionKey?: RuntimeV2ProjectionKey): Promise<void>;
}

export class MemoryProjectionCheckpointStore implements ProjectionCheckpointStore {
  readonly #rows = new Map<string, ProjectionCheckpointRow>();

  async read(sessionId: string, projectionKey: RuntimeV2ProjectionKey): Promise<ProjectionCheckpointRow | null> {
    return this.#rows.get(rowKey(sessionId, projectionKey)) ?? null;
  }

  async write(row: ProjectionCheckpointRow): Promise<void> {
    this.#rows.set(rowKey(row.sessionId, row.projectionKey), freezeRow(row));
  }

  async delete(sessionId: string, projectionKey?: RuntimeV2ProjectionKey): Promise<void> {
    if (projectionKey !== undefined) {
      this.#rows.delete(rowKey(sessionId, projectionKey));
      return;
    }
    for (const key of this.#rows.keys()) if (key.startsWith(`${sessionId}\u0000`)) this.#rows.delete(key);
  }
}

export function freezeRow(row: ProjectionCheckpointRow): ProjectionCheckpointRow {
  if (row.sessionId.length === 0) throw new TypeError("Checkpoint sessionId must be non-empty.");
  if (row.projectionKey.length === 0) throw new TypeError("Checkpoint projectionKey must be non-empty.");
  if (!Number.isSafeInteger(row.stateVersion) || row.stateVersion < 1) throw new TypeError("Checkpoint stateVersion must be >= 1.");
  if (!Number.isSafeInteger(row.throughJournalSeq) || row.throughJournalSeq < -1) throw new TypeError("Checkpoint seq must be >= -1.");
  return Object.freeze({ ...row, value: detached(row.value) });
}

function rowKey(sessionId: string, projectionKey: string): string {
  return `${sessionId}\u0000${projectionKey}`;
}

function detached(value: RuntimeV2JsonValue): RuntimeV2JsonValue {
  return value === null || typeof value !== "object" ? value : JSON.parse(JSON.stringify(value)) as RuntimeV2JsonValue;
}
