import { validateSessionEvents, type EventCodecRegistry, type SessionEventCandidateV1, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { RUN_EVENT, TASK_EVENT, eventCandidate } from "./task-events.js";
import { projectTasks } from "./task-projection.js";

export type RewindErrorCode = "REWIND_CONFLICT" | "REWIND_TURN_NOT_FOUND" | "REWIND_INHERITED" | "REWIND_UNAVAILABLE";
export class RewindError extends Error {
  constructor(readonly code: RewindErrorCode, message: string = code) { super(message); this.name = "RewindError"; }
}

export type RewindCut = {
  /** First dropped seq; the rewritten Journal keeps `events[0..cutSeq)`. */
  readonly cutSeq: number;
  readonly droppedThroughSeq: number;
  /** The edited Run's task; it is cancelled with the other leftover pending tasks. */
  readonly taskId: string;
  /** Appended after the prefix (agent-edit-resend-rewind.md §3.3). */
  readonly closing: readonly SessionEventCandidateV1[];
  /** Subagent Sessions created in the dropped part; they move to the parent's recovery area. */
  readonly droppedChildIds: readonly string[];
  /** Background tasks started in the dropped part; the registry forgets them. */
  readonly droppedBackgroundTaskIds: readonly string[];
};

/** Session settings keep their latest value across a rewind; grants follow the prefix. */
const SETTING_TYPES = new Set(["session/title-set", "session/title", "session/pinned-set", "session/archived-set", "session/workspace-set", "permission/mode-set", "agent/mode-set"]);

/**
 * Where a rewind to `runId` cuts the Journal, and what must follow the prefix so it stays closed:
 * leftover pending tasks are cancelled, background work that was open at the cut gets the settle
 * (and notification) it received later, and session settings keep their latest value.
 */
export function resolveRewindCut(sessionId: string, events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry, runId: string, inheritedThroughSeq: number): RewindCut {
  const start = events.find(event => event.type === RUN_EVENT && data(event).op === "start" && data(event).runId === runId && data(event).sessionId === sessionId);
  if (!start) throw new RewindError("REWIND_TURN_NOT_FOUND", "找不到这一轮。");
  const taskId = text(data(start).taskId);
  const accept = events.find(event => event.type === TASK_EVENT && data(event).op === "accept" && data(event).taskId === taskId);
  const opened = events.find(event => event.seq > start.seq && event.type === "user/message" && data(event).messageId === taskId && data(event).agentRunId === runId);
  // Only a Run opened by a user prompt can be edited; wake and compaction Runs have no prompt of their own.
  if (!accept || !opened) throw new RewindError("REWIND_TURN_NOT_FOUND", "这一轮不是由提问开始的。");
  const candidates = [accept.seq, start.seq];
  const cutSeq = candidates.find(seq => seq > inheritedThroughSeq && closedPrefix(sessionId, events.slice(0, seq), registry));
  if (cutSeq === undefined) {
    if (candidates.every(seq => seq <= inheritedThroughSeq)) throw new RewindError("REWIND_INHERITED", "这一轮来自父会话，不能在这里编辑。");
    throw new RewindError("REWIND_UNAVAILABLE", "这一轮之前的状态还没有收尾，不能从这里重来。");
  }
  const prefix = events.slice(0, cutSeq);
  const dropped = events.slice(cutSeq);
  const closing: SessionEventCandidateV1[] = [];
  const tasks = projectTasks(sessionId, prefix);
  for (const id of tasks.queue) closing.push(eventCandidate(TASK_EVENT, { op: "cancel", sessionId, taskId: id }));
  const openWork = openBackgroundWork(prefix);
  const discarded = new Set(dropped.filter(event => event.type === "agent/inbox/spliced" && data(event).operation === "discard").map(event => text(data(event).messageId)));
  const grants = activeGrants(prefix);
  const settings = new Map<string, SessionEventEnvelopeV1>();
  for (const event of dropped) {
    const value = data(event);
    if (event.type === "background/task" && value.op === "settle" && openWork.has(`task:${text(value.taskId)}`)) closing.push(copy(event));
    else if (event.type === "subagent/activation" && value.op === "settle" && openWork.has(`activation:${text(value.activationId)}`)) closing.push(copy(event));
    else if (event.type === "agent/inbox/spliced" && value.operation === "enqueue" && !discarded.has(text(value.messageId)) && openWork.has(`notice:${text(record(value.notice).taskId)}`)) closing.push(copy(event));
    // A revocation tightens permissions the prefix granted; keep it.
    else if (event.type === "permission/grant-revoked" && grants.has(text(value.grantId))) { grants.delete(text(value.grantId)); closing.push(copy(event)); }
    else if (SETTING_TYPES.has(event.type)) { settings.delete(event.type); settings.set(event.type, event); }
  }
  closing.push(...[...settings.values()].sort((a, b) => a.seq - b.seq).map(copy));
  return Object.freeze({
    cutSeq, droppedThroughSeq: events.at(-1)!.seq, taskId, closing: Object.freeze(closing),
    droppedChildIds: Object.freeze(unique(dropped.filter(event => event.type === "subagent/spawned").map(event => text(data(event).agentId)))),
    droppedBackgroundTaskIds: Object.freeze(unique(dropped.filter(event => event.type === "background/task" && data(event).op === "start").map(event => text(data(event).taskId)))),
  });
}

/** No open Turn, Step, request or tool call, and the scheduler holds no running Run or claimed task. Pending inbox items are allowed: the new Turn reads them. */
function closedPrefix(sessionId: string, prefix: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): boolean {
  try {
    const { accessState, relations } = validateSessionEvents(prefix, registry);
    if (accessState !== "read-write" && accessState !== "degraded") return false;
    if (relations.openTurnId !== null || relations.openStepId !== null || relations.openRequestIds.length || relations.openToolCallIds.length) return false;
    const tasks = projectTasks(sessionId, prefix);
    return tasks.runs.every(run => run.state !== "running") && tasks.tasks.every(task => task.state !== "claimed");
  } catch { return false; }
}

/** Background Bash tasks and subagent activations started in the prefix and not yet settled there. */
function openBackgroundWork(prefix: readonly SessionEventEnvelopeV1[]): ReadonlySet<string> {
  const open = new Set<string>();
  for (const event of prefix) {
    const value = data(event);
    if (event.type === "background/task" && value.op === "start") { open.add(`task:${text(value.taskId)}`); open.add(`notice:${text(value.taskId)}`); }
    if (event.type === "background/task" && value.op === "settle") { open.delete(`task:${text(value.taskId)}`); open.delete(`notice:${text(value.taskId)}`); }
    if (event.type === "subagent/activation" && value.op === "start") { open.add(`activation:${text(value.activationId)}`); open.add(`notice:${text(value.agentId)}`); }
    if (event.type === "subagent/activation" && value.op === "settle") { open.delete(`activation:${text(value.activationId)}`); open.delete(`notice:${text(value.agentId)}`); }
  }
  return open;
}

function activeGrants(prefix: readonly SessionEventEnvelopeV1[]): Set<string> {
  const grants = new Set<string>();
  for (const event of prefix) {
    if (event.type === "permission/grant-added") grants.add(text(data(event).grantId));
    if (event.type === "permission/grant-revoked") grants.delete(text(data(event).grantId));
  }
  return grants;
}

/** Same fact, new position: seq, time and provenance (which points at dropped seqs) are reassigned. */
function copy(event: SessionEventEnvelopeV1): SessionEventCandidateV1 {
  return { type: event.type, eventVersion: event.eventVersion, source: event.source, data: event.data, surface: event.surface };
}

function data(event: SessionEventEnvelopeV1): Readonly<Record<string, RuntimeV2JsonValue>> { return record(event.data); }
function record(value: RuntimeV2JsonValue | undefined): Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {};
}
function text(value: RuntimeV2JsonValue | undefined): string { return typeof value === "string" ? value : ""; }
function unique(values: readonly string[]): string[] { return [...new Set(values.filter(Boolean))]; }
