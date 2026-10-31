import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { TrajectoryCell, TrajectoryRecord, TrajectoryRequestView } from "./contract";
import { parseTimestamp } from "./format";

const dataOf = (record: TrajectoryRecord) => record.raw as Readonly<Record<string, RuntimeV2JsonValue>>;
const text = (value: RuntimeV2JsonValue | undefined) => typeof value === "string" ? value : null;
export type AuxiliaryRequest = { key: string; start: TrajectoryRecord; end?: TrajectoryRecord };

/** Auxiliary attempts have their own identity; sharing a parent step never merges them with its main request. */
export function collectAuxiliaryRequests(raw: readonly TrajectoryRecord[], byRequestId: Map<string, string>): AuxiliaryRequest[] {
  const attempts = new Map<string, AuxiliaryRequest>();
  for (const record of raw) {
    if (record.eventType !== "llm/auxiliary-start" && record.eventType !== "llm/auxiliary-end") continue;
    const id = text(dataOf(record).attemptId);
    if (!id) continue;
    const key = `auxiliary:${id}`;
    byRequestId.set(id, key);
    const attempt = attempts.get(id) ?? { key, start: record };
    if (record.eventType === "llm/auxiliary-end") attempt.end = record;
    attempts.set(id, attempt);
  }
  return [...attempts.values()];
}

export function auxiliaryRequestViews(attempts: readonly AuxiliaryRequest[], cells: readonly TrajectoryCell[]): (Omit<TrajectoryRequestView, "number"> & { seq: number })[] {
  return attempts.map(({ key, start, end }) => {
    const data = dataOf(start);
    const terminal = end ? dataOf(end) : null;
    const terminalStatus = terminal?.status === "completed" || terminal?.status === "failed" || terminal?.status === "aborted" ? terminal.status : undefined;
    const parent = start.callId === null ? undefined : cells.find(cell => (cell.kind === "tool" || cell.kind === "subtool") && cell.record.callId === start.callId && cell.record.turnId === start.turnId);
    const result = cells.find(cell => cell.kind === "compacted" && cell.requestKey === key);
    const attempt = typeof data.attempt === "number" ? data.attempt : 1;
    return {
      key, seq: start.sourceSequences[0] ?? 0, purpose: data.purpose as TrajectoryRequestView["purpose"], status: terminalStatus === undefined ? "running" : terminalStatus === "completed" ? "completed" : "failed",
      turn: parent?.turn ?? cells.find(cell => cell.requestKey === key)?.turn ?? null,
      group: start.stepId === null ? key : `step:${start.stepId}`, provider: text(data.routeId), model: text(data.model), options: null,
      usage: end?.usage ?? null, startedAt: parseTimestamp(text(data.startedAt)), completedAt: parseTimestamp(text(terminal?.finishedAt)),
      error: null, lastAttemptError: null, retries: 0, retryDelayMs: null, resultRecordId: result?.recordId ?? null,
      parentRecordId: parent?.recordId ?? null, attempt, terminalStatus, toolCalls: 0, subtoolCalls: 0,
    };
  });
}
