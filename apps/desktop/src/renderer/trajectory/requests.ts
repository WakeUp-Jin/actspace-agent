import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { TrajectoryCell, TrajectoryRecord, TrajectoryRequestView, TrajectoryRuntimeSnapshot, TrajectoryStatus } from "./contract";
import { parseTimestamp } from "./format";

type Data = Readonly<Record<string, RuntimeV2JsonValue>>;
const asData = (value: RuntimeV2JsonValue | undefined): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const str = (value: RuntimeV2JsonValue | undefined) => typeof value === "string" && value !== "" ? value : null;
const num = (value: RuntimeV2JsonValue | undefined) => typeof value === "number" && Number.isFinite(value) ? value : null;

export const stepKey = (turnId: string, stepId: string) => `${turnId}\u0000${stepId}`;

/** Request view key for a builder record: the exact request id first, then its step. */
export function requestKeyOf(record: TrajectoryRecord, requests: { readonly byRequestId: ReadonlyMap<string, string>; readonly keys: ReadonlySet<string> }): string | null {
  if (record.kind === "user" || record.kind === "context" || record.kind === "system") return null;
  const exact = record.requestId === null ? undefined : requests.byRequestId.get(record.requestId);
  if (exact !== undefined) return exact;
  if (record.turnId === null || record.stepId === null) return null;
  const key = stepKey(record.turnId, record.stepId);
  return requests.keys.has(key) ? key : null;
}

type StepRequest = { key: string; seq: number; turnId: string | null; stepId: string | null; headers: Data[]; options: RuntimeV2JsonValue | null; startedAt: number | null; retries: Data[] };

/**
 * One request view per step: a retry starts a new request id inside the same step, so DSH-style
 * retry counts and the last attempt's error fold into the step's view.
 */
export function deriveRequests(runtime: TrajectoryRuntimeSnapshot) {
  const raw = [...(runtime.rawRecords ?? [])].sort((a, b) => (a.sourceSequences[0] ?? 0) - (b.sourceSequences[0] ?? 0));
  const times = new Map(runtime.nodes.map(node => [node.eventSeq, node.time]));
  const byRequestId = new Map<string, string>();
  const steps = new Map<string, StepRequest>();
  for (const record of raw) {
    const seq = record.sourceSequences[0] ?? 0;
    const data = asData(record.raw);
    if (record.eventType === "request/header" || record.eventType === "request/context") {
      if (record.requestId === null) continue;
      const key = byRequestId.get(record.requestId)
        ?? (record.turnId !== null && record.stepId !== null ? stepKey(record.turnId, record.stepId) : `request:${record.requestId}`);
      byRequestId.set(record.requestId, key);
      const step = steps.get(key) ?? { key, seq, turnId: record.turnId, stepId: record.stepId, headers: [], options: null, startedAt: parseTimestamp(times.get(seq)), retries: [] };
      if (record.eventType === "request/header") step.headers.push(data);
      else step.options = asData(data.snapshot).requestOptions ?? data.options ?? step.options;
      steps.set(key, step);
    }
    if (record.eventType === "llm/retry" && record.requestId !== null) {
      const step = steps.get(byRequestId.get(record.requestId) ?? "");
      step?.retries.push(data);
    }
  }
  const turnState = new Map(runtime.turns.map(turn => [turn.id, { number: turn.number, state: turn.state }]));

  function finish(cells: readonly TrajectoryCell[]): ReadonlyMap<string, TrajectoryRequestView> {
    const byKey = new Map<string, TrajectoryCell[]>();
    for (const cell of cells) if (cell.requestKey !== null) byKey.set(cell.requestKey, [...(byKey.get(cell.requestKey) ?? []), cell]);
    const views: (Omit<TrajectoryRequestView, "number"> & { seq: number })[] = [];
    for (const step of steps.values()) {
      const own = byKey.get(step.key) ?? [];
      const assistant = own.find(cell => cell.kind === "message" && !cell.requestOnly);
      const record = assistant?.record;
      const turn = turnState.get(step.turnId ?? "");
      const status: TrajectoryStatus = assistant
        ? assistant.isError ? "failed" : record!.partial || record!.completedAt === null ? "running" : "completed"
        : turn?.state === "failed" || turn?.state === "aborted" ? "failed" : turn?.state === "completed" ? "completed" : "running";
      const header = step.headers.at(-1) ?? {};
      const lastRetry = step.retries.at(-1);
      views.push({
        key: step.key, seq: step.seq, purpose: "assistant", status,
        turn: own[0]?.turn ?? turn?.number ?? null,
        group: `step:${step.stepId}`,
        provider: str(header.routeId) ?? str(header.provider) ?? record?.requestDetail?.provider ?? null,
        model: str(header.model) ?? record?.requestDetail?.model ?? null,
        options: record?.requestDetail?.options ?? step.options,
        usage: record?.usage ?? null,
        startedAt: step.startedAt,
        completedAt: parseTimestamp(record?.completedAt),
        error: status === "failed" ? record?.error ?? str(asData(record?.raw).error) ?? str(asData(lastRetry?.failure).message) : null,
        lastAttemptError: lastRetry ? str(asData(lastRetry.failure).message) ?? str(lastRetry.reason) : null,
        retries: step.retries.length,
        retryDelayMs: lastRetry ? num(lastRetry.delayMs) : null,
        resultRecordId: assistant?.recordId ?? null,
        toolCalls: own.filter(cell => cell.kind === "tool").length,
        subtoolCalls: own.filter(cell => cell.kind === "subtool").length,
      });
    }
    for (const cell of cells) {
      if (cell.kind !== "compacted") continue;
      const status: TrajectoryStatus = cell.isError ? "failed" : cell.durationMs === null ? "running" : "completed";
      views.push({
        key: `compaction:${cell.recordId}`, seq: cell.record.sourceSequences[0] ?? 0, purpose: "compaction", status,
        turn: cell.turn, group: cell.group, provider: null, model: null, options: null, usage: cell.record.usage,
        startedAt: cell.startedAt, completedAt: parseTimestamp(cell.record.completedAt),
        error: cell.isError ? cell.record.error ?? null : null, lastAttemptError: null, retries: 0, retryDelayMs: null,
        resultRecordId: cell.recordId, toolCalls: 0, subtoolCalls: 0,
      });
    }
    const offset = runtime.requestOffset ?? 0;
    return new Map(views.sort((a, b) => a.seq - b.seq).map(({ seq: _seq, ...view }, index) => [view.key, { ...view, number: offset + index + 1 }]));
  }

  return { byRequestId, keys: new Set(steps.keys()) as ReadonlySet<string>, finish };
}
