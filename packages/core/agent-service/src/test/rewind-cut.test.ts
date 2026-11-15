import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type SessionEventCandidateV1 } from "@actspace/session-journal";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { resolveRewindCut } from "../rewind-cut.js";
import { taskCodecs, TASK_EVENT, RUN_EVENT, eventCandidate } from "../task-events.js";

const SESSION = "s";
const harness = { harnessId: "main", generationId: "generation-1", revision: 1 };
const at = "2026-11-07T00:00:00.000Z";
function registry() { const codecs = createCoreCodecRegistry(); for (const codec of taskCodecs) codecs.register(codec); return codecs; }
function core(type: string, data: Record<string, RuntimeJsonValue>, surface: SessionEventCandidateV1["surface"] = null): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface };
}

/** A prompt Turn as the scheduler and the Loop write it. `between` lands after accept, before the Run starts. */
function turn(journal: SessionJournal, n: number, options: { between?: SessionEventCandidateV1[]; inside?: SessionEventCandidateV1[] } = {}) {
  const taskId = `task-${n}`, runId = `run-${n}`;
  journal.append(eventCandidate(TASK_EVENT, { op: "accept", sessionId: SESSION, taskId, submissionId: `sub-${n}`, content: `prompt ${n}`, continuationOf: null }));
  for (const event of options.between ?? []) journal.append(event);
  journal.append(eventCandidate(RUN_EVENT, { op: "start", sessionId: SESSION, runId, taskId, harness, configuration: null }));
  journal.append(eventCandidate(TASK_EVENT, { op: "claim", sessionId: SESSION, taskId, runId }));
  journal.append(core("turn/start", { turnId: `turn-${n}`, agentRunId: runId }));
  journal.append(core("user/message", { messageId: taskId, agentRunId: runId, content: `prompt ${n}` }, { kind: "append" }));
  for (const event of options.inside ?? []) journal.append(event);
  journal.append(core("turn/end", { turnId: `turn-${n}`, status: "completed" }));
  journal.append(eventCandidate(RUN_EVENT, { op: "finish", sessionId: SESSION, runId, outcome: "completed", result: null }));
}

describe("resolveRewindCut", () => {
  it("cuts at the edited prompt's accept and drops every later Turn", () => {
    const journal = new SessionJournal({ registry: registry() });
    for (const n of [1, 2, 3]) turn(journal, n);
    const events = journal.readEvents();
    const cut = resolveRewindCut(SESSION, events, registry(), "run-2", -1);
    const accept = events.find(event => event.type === TASK_EVENT && (event.data as { op: string; taskId: string }).op === "accept" && (event.data as { taskId: string }).taskId === "task-2")!;
    expect(cut.cutSeq).toBe(accept.seq);
    expect(cut.taskId).toBe("task-2");
    expect(cut.droppedThroughSeq).toBe(events.at(-1)!.seq);
    expect(cut.closing).toEqual([]);
    expect(cut.droppedChildIds).toEqual([]);
    // Editing the first prompt rewinds to an empty Journal.
    expect(resolveRewindCut(SESSION, events, registry(), "run-1", -1).cutSeq).toBe(0);
  });

  it("cancels prompts queued before the cut so the new one is not stuck behind them", () => {
    const journal = new SessionJournal({ registry: registry() });
    turn(journal, 1, { inside: [eventCandidate(TASK_EVENT, { op: "accept", sessionId: SESSION, taskId: "queued", submissionId: "sub-q", content: "later", continuationOf: null })] });
    turn(journal, 2);
    const cut = resolveRewindCut(SESSION, journal.readEvents(), registry(), "run-2", -1);
    expect(cut.closing.map(event => [event.type, (event.data as { op: string; taskId: string }).op, (event.data as { taskId: string }).taskId])).toEqual([[TASK_EVENT, "cancel", "queued"]]);
  });

  it("falls back to the Run start when the accept sits inside an earlier open Turn", () => {
    const journal = new SessionJournal({ registry: registry() });
    // Task 2 is accepted while Turn 1 is open (queued during a reply), so a cut at its accept would leave Turn 1 open.
    const taskId = "task-2", runId = "run-2";
    journal.append(eventCandidate(TASK_EVENT, { op: "accept", sessionId: SESSION, taskId: "task-1", submissionId: "sub-1", content: "one", continuationOf: null }));
    journal.append(eventCandidate(RUN_EVENT, { op: "start", sessionId: SESSION, runId: "run-1", taskId: "task-1", harness, configuration: null }));
    journal.append(eventCandidate(TASK_EVENT, { op: "claim", sessionId: SESSION, taskId: "task-1", runId: "run-1" }));
    journal.append(core("turn/start", { turnId: "turn-1", agentRunId: "run-1" }));
    journal.append(core("user/message", { messageId: "task-1", agentRunId: "run-1", content: "one" }, { kind: "append" }));
    journal.append(eventCandidate(TASK_EVENT, { op: "accept", sessionId: SESSION, taskId, submissionId: "sub-2", content: "two", continuationOf: null }));
    journal.append(core("turn/end", { turnId: "turn-1", status: "completed" }));
    journal.append(eventCandidate(RUN_EVENT, { op: "finish", sessionId: SESSION, runId: "run-1", outcome: "completed", result: null }));
    const start = journal.append(eventCandidate(RUN_EVENT, { op: "start", sessionId: SESSION, runId, taskId, harness, configuration: null }));
    journal.append(eventCandidate(TASK_EVENT, { op: "claim", sessionId: SESSION, taskId, runId }));
    journal.append(core("turn/start", { turnId: "turn-2", agentRunId: runId }));
    journal.append(core("user/message", { messageId: taskId, agentRunId: runId, content: "two" }, { kind: "append" }));
    journal.append(core("turn/end", { turnId: "turn-2", status: "completed" }));
    journal.append(eventCandidate(RUN_EVENT, { op: "finish", sessionId: SESSION, runId, outcome: "completed", result: null }));
    const cut = resolveRewindCut(SESSION, journal.readEvents(), registry(), runId, -1);
    expect(cut.cutSeq).toBe(start.seq);
    // The edited task is still pending in the prefix: it is cancelled, and the new submission replaces it.
    expect(cut.closing.map(event => (event.data as { taskId: string }).taskId)).toEqual([taskId]);
  });

  it("closes background work that was open at the cut with the settle and notice it got later", () => {
    const journal = new SessionJournal({ registry: registry() });
    turn(journal, 1, { inside: [
      core("background/task", { op: "start", taskId: "bg-1", kind: "bash", callId: "call-1", description: "build", startedAt: at }),
      core("subagent/spawned", { agentId: "agent-old", callId: "call-2", description: "old", transcriptPath: "sessions/agent-old", kind: "local", preset: "general", createdAt: at }),
      core("subagent/activation", { op: "start", agentId: "agent-old", activationId: "act-1", trigger: "spawn", callId: "call-2", background: true, startedAt: at }),
    ] });
    turn(journal, 2, { inside: [
      core("background/task", { op: "settle", taskId: "bg-1", status: "completed", delivery: "notified", endedAt: at }),
      core("agent/inbox/spliced", { operation: "enqueue", messageId: "notice-bg", target: "next-turn", content: "done", source: "task_notification", notice: { taskId: "bg-1", kind: "bash", title: "build", status: "completed" } }),
      core("subagent/activation", { op: "settle", agentId: "agent-old", activationId: "act-1", status: "completed", summary: "ok", delivery: "notified", endedAt: at }),
      core("background/task", { op: "start", taskId: "bg-new", kind: "bash", callId: "call-3", description: "test", startedAt: at }),
      core("subagent/spawned", { agentId: "agent-new", callId: "call-4", description: "new", transcriptPath: "sessions/agent-new", kind: "local", preset: "explore", createdAt: at }),
      core("session/title-set", { title: "first" }),
      core("session/title-set", { title: "second" }),
    ] });
    const cut = resolveRewindCut(SESSION, journal.readEvents(), registry(), "run-2", -1);
    expect(cut.closing.map(event => event.type)).toEqual(["background/task", "agent/inbox/spliced", "subagent/activation", "session/title-set"]);
    expect(cut.closing.at(-1)!.data).toEqual({ title: "second" });
    expect(cut.droppedChildIds).toEqual(["agent-new"]);
    expect(cut.droppedBackgroundTaskIds).toEqual(["bg-new"]);
    // The closing events must apply on top of the prefix.
    const rewritten = new SessionJournal({ registry: registry(), seed: journal.readEvents().slice(0, cut.cutSeq) });
    expect(() => rewritten.appendMany(cut.closing)).not.toThrow();
  });

  it("refuses Runs it cannot rewind to", () => {
    const journal = new SessionJournal({ registry: registry() });
    for (const n of [1, 2]) turn(journal, n);
    const events = journal.readEvents();
    expect(() => resolveRewindCut(SESSION, events, registry(), "missing", -1)).toThrow(expect.objectContaining({ code: "REWIND_TURN_NOT_FOUND" }));
    expect(() => resolveRewindCut(SESSION, events, registry(), "run-2", events.at(-1)!.seq)).toThrow(expect.objectContaining({ code: "REWIND_INHERITED" }));
  });
});
