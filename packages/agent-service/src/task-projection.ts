import { snapshotSessionJson, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { TaskError, type TaskSnapshot, type TaskRecord, type RunRecord } from "./contracts.js";
import { TASK_EVENT, RUN_EVENT, QUEUE_EVENT, TASK_OWNER, validateSchedulingEvent } from "./task-events.js";

/** Keep inherited Journal facts for provenance, but never inherit executable state. */
export function projectTasks(sessionId: string, events: readonly SessionEventEnvelopeV1[]): TaskSnapshot {
  const tasks = new Map<string, TaskRecord>();
  const runs = new Map<string, RunRecord>();
  let queue: string[] = [];
  let revision = -1;
  let paused = false;
  const pending = (id: string) => { const task = tasks.get(id); if (!task || task.state !== "pending") invalid(); return task; };
  const active = (id: string) => { const run = runs.get(id); if (!run || run.state !== "running") invalid(); return run; };
  for (const event of events) {
    if (![TASK_EVENT, RUN_EVENT, QUEUE_EVENT].includes(event.type)) continue;
    if (event.source.ownerPluginId !== TASK_OWNER) invalid();
    const data = event.data;
    validateSchedulingEvent(event.type, data);
    if (data.sessionId !== sessionId) continue;
    revision = event.seq;
    switch (data.op) {
      case "accept":
        if (tasks.has(data.taskId) || [...tasks.values()].some(task => task.submissionId === data.submissionId)) invalid();
        if (data.continuationOf !== null && !["failed", "interrupted", "cancelled"].includes(tasks.get(data.continuationOf)?.state ?? "")) invalid();
        tasks.set(data.taskId, { taskId: data.taskId, submissionId: data.submissionId, content: data.content, continuationOf: data.continuationOf, acceptedSeq: event.seq, state: "pending", runId: null, targetRunId: null });
        queue.push(data.taskId);
        break;
      case "designate": {
        const task = pending(data.taskId);
        if (data.runId !== null) active(data.runId);
        tasks.set(task.taskId, { ...task, targetRunId: data.runId });
        break;
      }
      case "cancel": tasks.set(data.taskId, { ...pending(data.taskId), state: "cancelled", targetRunId: null }); queue = queue.filter(id => id !== data.taskId); break;
      case "operation-start": {
        const task = pending(data.taskId);
        if (paused || task.targetRunId || queue[0] !== task.taskId || [...tasks.values()].some(item => item.state === "claimed")) invalid();
        tasks.set(task.taskId, { ...task, state: "claimed" }); queue = queue.filter(id => id !== task.taskId); break;
      }
      case "operation-finish": {
        const task = tasks.get(data.taskId);
        if (!task || task.state !== "claimed" || task.runId !== null) invalid();
        tasks.set(task.taskId, { ...task, state: data.outcome, ...(data.result !== undefined ? { result: data.result } : {}) });
        if (data.outcome !== "completed") paused = true;
        break;
      }
      case "start": {
        const task = pending(data.taskId);
        if (paused || runs.has(data.runId) || [...runs.values()].some(run => run.state === "running") || task.targetRunId !== null || queue.find(id => tasks.get(id)?.targetRunId === null) !== task.taskId) invalid();
        runs.set(data.runId, { runId: data.runId, taskId: data.taskId, harness: data.harness, configuration: data.configuration, state: "running", result: null });
        break;
      }
      case "claim": {
        const task = pending(data.taskId); const run = active(data.runId);
        if (run.taskId !== task.taskId && task.targetRunId !== run.runId) invalid();
        tasks.set(task.taskId, { ...task, state: "claimed", runId: run.runId, targetRunId: null });
        queue = queue.filter(id => id !== task.taskId);
        break;
      }
      case "finish": {
        const run = active(data.runId);
        runs.set(run.runId, { ...run, state: data.outcome, result: data.result });
        for (const task of tasks.values()) {
          if (task.runId === run.runId && task.state === "claimed") tasks.set(task.taskId, { ...task, state: data.outcome });
          else if (task.targetRunId === run.runId) tasks.set(task.taskId, { ...task, targetRunId: null });
        }
        if (data.outcome !== "completed") paused = true;
        break;
      }
      case "move": {
        if (pending(data.taskId).targetRunId !== null || pending(data.beforeTaskId).targetRunId !== null || data.taskId === data.beforeTaskId) invalid();
        queue = queue.filter(id => id !== data.taskId);
        queue.splice(queue.indexOf(data.beforeTaskId), 0, data.taskId);
        break;
      }
      case "pause": paused = true; break;
      case "resume": paused = false; break;
      case "recover":
        paused = true;
        for (const run of runs.values()) if (run.state === "running") runs.set(run.runId, { ...run, state: "interrupted" });
        for (const task of tasks.values()) tasks.set(task.taskId, { ...task, targetRunId: null, state: task.state === "claimed" ? "interrupted" : task.state });
        break;
    }
  }
  return snapshotSessionJson({ sessionId, revision, paused, tasks: [...tasks.values()], queue, runs: [...runs.values()] });
}
function invalid(): never { throw new TaskError("INVALID_EVENT"); }
