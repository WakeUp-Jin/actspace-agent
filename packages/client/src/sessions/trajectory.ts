import type { SessionEventEnvelopeV1, RuntimeV2EventWindow, RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";

export function projectTrajectoryWindow(sessionId: string, window: RuntimeV2EventWindow): RuntimeV2TrajectorySnapshot {
  return { kind: "trajectory", schemaVersion: 1, sessionId, throughJournalSeq: window.throughJournalSeq,
    nodes: window.events.map(event => toNode(sessionId, event)),
    history: { fromSeq: window.fromSeq, previousFromSeq: window.beforeSeq, turnOffset: window.turnOffset, requestOffset: window.requestOffset } };
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
