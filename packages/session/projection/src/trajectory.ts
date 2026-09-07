import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";

export const TRAJECTORY_PROJECTION_KEY = "trajectory" as const;
export const TRAJECTORY_STATE_VERSION = 1 as const;

export type TrajectoryProjection = RuntimeV2TrajectorySnapshot;

export function projectTrajectory(sessionId: string, events: readonly SessionEventEnvelopeV1[]): TrajectoryProjection {
  validateEvents(events);
  const nodes = events.map((event) => toNode(sessionId, event));
  const throughJournalSeq = events.length === 0 ? -1 : (events[events.length - 1]?.seq ?? -1);
  return Object.freeze({ kind: "trajectory", schemaVersion: 1, sessionId, throughJournalSeq, nodes: Object.freeze(nodes) });
}

/** Cumulative tail, paged at complete turn boundaries. Never splits call/result pairs. */
export function projectTrajectoryWindow(sessionId: string, events: readonly SessionEventEnvelopeV1[], fromSeq?: number): TrajectoryProjection {
  validateEvents(events);
  if (fromSeq !== undefined && (!Number.isSafeInteger(fromSeq) || fromSeq < 0 || fromSeq > events.length)) throw new Error("Invalid trajectory history cursor.");
  const starts = events.filter(event => event.type === "turn/start").map(event => {
    let start = event.seq;
    for (let index = start - 1; index >= 0; index -= 1) {
      const prior = events[index]!;
      if (prior.type === "turn/end" || prior.type === "turn/start") break;
      if (prior.type === "agent/inbox/spliced" && record(prior.data).operation === "claim" && prior.surface?.kind === "append") start = index;
    }
    return start;
  });
  const pageSize = 20;
  const startIndex = fromSeq === undefined ? Math.max(0, starts.length - pageSize) : Math.max(0, starts.filter(seq => seq <= fromSeq).length - 1);
  const start = startIndex === 0 ? 0 : starts[startIndex]!;
  const previousFromSeq = startIndex === 0 ? null : startIndex <= pageSize ? 0 : starts[startIndex - pageSize]!;
  return Object.freeze({ kind: "trajectory", schemaVersion: 1, sessionId,
    throughJournalSeq: events.at(-1)?.seq ?? -1,
    nodes: Object.freeze(events.slice(start).map(event => toNode(sessionId, event))),
    history: Object.freeze({ fromSeq: start, previousFromSeq, turnOffset: startIndex, requestOffset: new Set(events.slice(0, start).filter(event => event.type === "request/header").map(event => record(event.data).requestId).filter(id => typeof id === "string")).size }),
  });
}

export function applyTrajectory(snapshot: TrajectoryProjection, event: SessionEventEnvelopeV1): TrajectoryProjection {
  if (event.seq !== snapshot.throughJournalSeq + 1) throw new Error(`Trajectory event gap: expected ${snapshot.throughJournalSeq + 1}, received ${event.seq}.`);
  if (event.seq < 0) throw new Error("Trajectory event seq must be non-negative.");
  return Object.freeze({ ...snapshot, throughJournalSeq: event.seq, nodes: Object.freeze([...snapshot.nodes, toNode(snapshot.sessionId, event)]) });
}

function toNode(sessionId: string, event: SessionEventEnvelopeV1): RuntimeV2TrajectoryNode {
  const data = event.data;
  const callId = record(data).callId ?? record(data).toolCallId;
  return Object.freeze({
    key: `${sessionId}:${event.seq}`,
    sessionId,
    eventSeq: event.seq,
    eventType: event.type,
    time: event.time,
    kind: trajectoryKind(event.type),
    state: trajectoryState(event.type, record(data).status, record(data).finishReason ?? record(data).reason),
    callId: typeof callId === "string" ? callId : null,
    data: detached(data),
    surface: detached(event.surface as RuntimeV2JsonValue ?? null),
    source: detached(event.source as RuntimeV2JsonValue),
  });
}

function trajectoryKind(type: string): RuntimeV2TrajectoryNode["kind"] {
  if (type.startsWith("turn/")) return "turn";
  if (type.startsWith("step/")) return "step";
  if (type.startsWith("request/")) return "request";
  if (type === "user/message" || type === "agent/inbox/spliced") return "user";
  if (type.startsWith("assistant/")) return "assistant";
  if (type.startsWith("tool")) return "tool";
  if (type.startsWith("approval/")) return "approval";
  if (type.startsWith("llm/retry")) return "retry";
  if (type.startsWith("compaction/")) return "compaction";
  if (type.includes("error") || type === "error") return "error";
  return "other";
}

function trajectoryState(type: string, status: RuntimeV2JsonValue | undefined, reason: RuntimeV2JsonValue | undefined): RuntimeV2TrajectoryNode["state"] {
  if (type.includes("error") || status === "failed" || status === "denied" || reason === "failed") return "failed";
  if (reason === "aborted" || status === "aborted") return "aborted";
  if (type.endsWith("/start") || type.endsWith("/asked") || type.endsWith("/requested")) return "started";
  if (type.endsWith("/end") || type.endsWith("/completed") || type.endsWith("/decided") || type === "assistant/message" || type === "tool/result") return "completed";
  if (type.endsWith("/chunk") || type.endsWith("/summary") || type.endsWith("/change") || type.endsWith("/write")) return "updated";
  return "observed";
}

function record(value: RuntimeV2JsonValue): Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {};
}

function detached(value: RuntimeV2JsonValue): RuntimeV2JsonValue {
  return value === null || typeof value !== "object" ? value : JSON.parse(JSON.stringify(value)) as RuntimeV2JsonValue;
}

function validateEvents(events: readonly SessionEventEnvelopeV1[]): void {
  for (let index = 0; index < events.length; index += 1) if (events[index]!.seq !== index) throw new Error(`Trajectory Journal must be contiguous at seq ${index}.`);
}
