import type { EventCodec, SessionEventCandidateV1 } from "@actspace/session-journal";
import { snapshotSessionJson } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { HarnessIdentity, RunOutcome } from "./contracts.js";

export const TASK_OWNER = "actspace.agent-service";
export const TASK_EVENT = `plugin/${TASK_OWNER}/task`;
export const RUN_EVENT = `plugin/${TASK_OWNER}/run`;
export const QUEUE_EVENT = `plugin/${TASK_OWNER}/queue`;
type Owned = { readonly sessionId: string };
export type TaskEvent = Owned & (
  | { readonly op: "accept"; readonly taskId: string; readonly submissionId: string; readonly content: RuntimeV2JsonValue; readonly continuationOf: string | null }
  | { readonly op: "designate"; readonly taskId: string; readonly runId: string | null }
  | { readonly op: "cancel"; readonly taskId: string }
  | { readonly op: "operation-start"; readonly taskId: string }
  | { readonly op: "operation-finish"; readonly taskId: string; readonly outcome: RunOutcome }
  | { readonly op: "claim"; readonly taskId: string; readonly runId: string }
);
export type RunEvent = Owned & (
  | { readonly op: "start"; readonly runId: string; readonly taskId: string; readonly harness: HarnessIdentity; readonly configuration: RuntimeV2JsonValue }
  | { readonly op: "finish"; readonly runId: string; readonly outcome: RunOutcome; readonly result: RuntimeV2JsonValue }
);
export type QueueEvent = Owned & (
  | { readonly op: "pause" | "resume" | "recover" }
  | { readonly op: "move"; readonly taskId: string; readonly beforeTaskId: string }
);
export type SchedulingEvent = TaskEvent | RunEvent | QueueEvent;

/** Pure codec entry: no behavior, filesystem, Host or Loop activation. */
export const taskCodecs: readonly EventCodec[] = [TASK_EVENT, RUN_EVENT, QUEUE_EVENT].map(type => ({
  type, ownerPluginId: TASK_OWNER, currentVersion: 1, criticality: "required" as const,
  validate: (value: RuntimeV2JsonValue) => validateSchedulingEvent(type, value),
}));

export function eventCandidate(type: string, data: SchedulingEvent): SessionEventCandidateV1 {
  validateSchedulingEvent(type, data);
  return { type, eventVersion: 1, source: { ownerPluginId: TASK_OWNER }, data: snapshotSessionJson(data) as RuntimeV2JsonValue, surface: null };
}

export function validateSchedulingEvent(type: string, value: unknown): asserts value is SchedulingEvent {
  if (!record(value)) invalid();
  text(value.sessionId);
  const op = value.op;
  let keys: string[];
  if (type === TASK_EVENT) {
    text(value.taskId);
    if (op === "accept") {
      text(value.submissionId);
      if (value.continuationOf !== null) text(value.continuationOf);
      snapshotSessionJson(value.content);
      keys = ["taskId", "submissionId", "content", "continuationOf"];
    } else if (op === "designate" || op === "claim") {
      if (op === "claim" || value.runId !== null) text(value.runId);
      keys = ["taskId", "runId"];
    } else if (op === "cancel" || op === "operation-start") keys = ["taskId"];
    else if (op === "operation-finish") { if (!["completed", "failed", "cancelled"].includes(String(value.outcome))) invalid(); keys = ["taskId", "outcome"]; }
    else invalid();
  } else if (type === RUN_EVENT) {
    text(value.runId);
    if (op === "start") {
      text(value.taskId);
      if (!record(value.harness)) invalid();
      text(value.harness.harnessId); text(value.harness.generationId);
      if (!Number.isSafeInteger(value.harness.revision) || (value.harness.revision as number) < 1) invalid();
      if (Object.keys(value.harness).some(key => !["harnessId", "generationId", "revision"].includes(key))) invalid();
      snapshotSessionJson(value.configuration);
      keys = ["runId", "taskId", "harness", "configuration"];
    } else if (op === "finish") {
      if (!["completed", "failed", "cancelled", "interrupted"].includes(String(value.outcome))) invalid();
      snapshotSessionJson(value.result);
      keys = ["runId", "outcome", "result"];
    } else invalid();
  } else if (type === QUEUE_EVENT) {
    if (op === "move") { text(value.taskId); text(value.beforeTaskId); keys = ["taskId", "beforeTaskId"]; }
    else if (op === "pause" || op === "resume" || op === "recover") keys = [];
    else invalid();
  } else invalid();
  const allowed = new Set(["op", "sessionId", ...keys]);
  if (Object.keys(value).some(key => !allowed.has(key))) invalid();
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): asserts value is string { if (typeof value !== "string" || !value.length) invalid(); }
function invalid(): never { throw new Error("Invalid agent-service scheduling event"); }
