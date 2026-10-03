import { randomUUID } from "node:crypto";
import { snapshotSessionJson, type SessionEventCandidateV1 } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { TaskError, type TaskSnapshot, type TaskRecord, type TaskReceipt, type HarnessIdentity, type RunOutcome } from "./contracts.js";
import { TASK_EVENT, RUN_EVENT, QUEUE_EVENT, eventCandidate } from "./task-events.js";
import { projectTasks } from "./task-projection.js";

/** One ledger per owned Session writer. All scheduling mutations share its serial lane. */
export class TaskLedger {
  readonly #listeners = new Set<(snapshot: TaskSnapshot) => void>();
  subscribe(listener: (snapshot: TaskSnapshot) => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  #tail: Promise<unknown> = Promise.resolve();
  #failure: unknown;
  #blocked = false;
  #snapshot: TaskSnapshot;
  private constructor(readonly session: SessionHandle) { this.#snapshot = projectTasks(session.header.sessionId, session.journal.events); }

  /** Only call once when taking ownership, never when refreshing a client view. */
  static async open(session: SessionHandle): Promise<TaskLedger> {
    const ledger = new TaskLedger(session);
    // Finish prior acceptance before acknowledging even a duplicate request.
    await session.flush();
    if (ledger.#snapshot.queue.length || ledger.#snapshot.tasks.some(task => task.state === "claimed")) {
      await ledger.#commit([eventCandidate(QUEUE_EVENT, { sessionId: session.header.sessionId, op: "recover" })]);
    }
    return ledger;
  }
  snapshot(): TaskSnapshot { return this.#snapshot; }
  get blocked(): boolean { return this.#blocked; }

  submit(submissionId: string, content: RuntimeV2JsonValue, continuationOf: string | null = null): Promise<TaskReceipt> {
    // Capture before waiting: caller mutation must not change a queued submission.
    const captured = snapshotSessionJson(content);
    return this.#serialize(async () => {
      const previous = this.#snapshot.tasks.find(task => task.submissionId === submissionId);
      if (previous) {
        if (canonical(previous.content) !== canonical(captured) || previous.continuationOf !== continuationOf) this.#error("SUBMISSION_CONFLICT");
        return this.#receipt(previous.taskId);
      }
      if (continuationOf !== null && !["failed", "cancelled", "interrupted"].includes(this.#task(continuationOf).state)) this.#error("TASK_NOT_PENDING");
      const taskId = randomUUID();
      await this.#commit([eventCandidate(TASK_EVENT, { op: "accept", sessionId: this.session.header.sessionId, taskId, submissionId, content: captured, continuationOf })]);
      return this.#receipt(taskId);
    });
  }

  designate(taskId: string, runId: string | null, expectedRevision: number): Promise<TaskSnapshot> {
    return this.#serialize(async () => {
      this.#revision(expectedRevision); this.#pending(taskId);
      if (runId !== null) {
        this.#active(runId);
        const content = this.#task(taskId).content;
        const original = content && typeof content === "object" && "kind" in content && content.kind === "composer-task" ? content.original : null;
        if (original && typeof original === "object" && "userInput" in original && typeof original.userInput === "string" && original.userInput.trim() === "/compact") this.#error("QUEUE_ORDER");
      }
      await this.#commit([eventCandidate(TASK_EVENT, { op: "designate", sessionId: this.session.header.sessionId, taskId, runId })]);
      return this.#snapshot;
    });
  }
  cancel(taskId: string, expectedRevision: number): Promise<TaskSnapshot> {
    return this.#serialize(async () => {
      this.#revision(expectedRevision); this.#pending(taskId);
      await this.#commit([eventCandidate(TASK_EVENT, { op: "cancel", sessionId: this.session.header.sessionId, taskId })]);
      return this.#snapshot;
    });
  }
  move(taskId: string, beforeTaskId: string, expectedRevision: number): Promise<TaskSnapshot> {
    return this.#serialize(async () => {
      this.#revision(expectedRevision);
      if (taskId === beforeTaskId || this.#pending(taskId).targetRunId !== null || this.#pending(beforeTaskId).targetRunId !== null) this.#error("QUEUE_ORDER");
      await this.#commit([eventCandidate(QUEUE_EVENT, { op: "move", sessionId: this.session.header.sessionId, taskId, beforeTaskId })]);
      return this.#snapshot;
    });
  }
  setPaused(paused: boolean, expectedRevision: number): Promise<TaskSnapshot> {
    return this.#serialize(async () => {
      this.#revision(expectedRevision);
      await this.#commit([eventCandidate(QUEUE_EVENT, { op: paused ? "pause" : "resume", sessionId: this.session.header.sessionId })]);
      return this.#snapshot;
    });
  }

  /** Runtime-owned stop/close path, ordered with mutations without a stale client revision. */
  pause(): Promise<void> {
    return this.#serialize(() => this.#commit([eventCandidate(QUEUE_EVENT, { op: "pause", sessionId: this.session.header.sessionId })]));
  }

  /** Persist run identity and its initial input atomically before calling the factory. */
  start(taskId: string, runId: string, harness: HarnessIdentity, configuration: RuntimeV2JsonValue): Promise<TaskRecord> {
    const captured = snapshotSessionJson({ harness, configuration });
    return this.#serialize(async () => {
      if (this.#snapshot.paused) this.#error("QUEUE_PAUSED");
      if (this.#snapshot.runs.some(run => run.state === "running" || run.runId === runId)) this.#error("SESSION_BUSY");
      const task = this.#pending(taskId);
      if (task.targetRunId !== null || this.#snapshot.queue.find(id => this.#task(id).targetRunId === null) !== taskId) this.#error("QUEUE_ORDER");
      await this.#commit([
        eventCandidate(RUN_EVENT, { op: "start", sessionId: this.session.header.sessionId, taskId, runId, ...captured }),
        ...this.#claimEvents(task, runId),
      ]);
      return this.#task(taskId);
    });
  }
  /** The Loop calls this at a safe boundary; unclaimed steering is still queue content. */
  claimSupplement(runId: string): Promise<readonly TaskRecord[]> {
    return this.#serialize(async () => {
      this.#active(runId);
      const tasks = this.#snapshot.queue.map(id => this.#task(id)).filter(task => task.targetRunId === runId);
      if (tasks.length) await this.#commit(tasks.flatMap(task => this.#claimEvents(task, runId)));
      return Object.freeze(tasks.map(task => this.#task(task.taskId)));
    });
  }
  startOperation(taskId: string): Promise<void> {
    return this.#serialize(async () => {
      if (this.#snapshot.paused) this.#error("QUEUE_PAUSED");
      this.#pending(taskId);
      if (this.#snapshot.queue[0] !== taskId || this.#snapshot.tasks.some(task => task.state === "claimed")) this.#error("SESSION_BUSY");
      await this.#commit([eventCandidate(TASK_EVENT, { op: "operation-start", sessionId: this.session.header.sessionId, taskId })]);
    });
  }
  finishOperation(taskId: string, outcome: RunOutcome): Promise<void> {
    return this.#serialize(() => this.#commit([eventCandidate(TASK_EVENT, { op: "operation-finish", sessionId: this.session.header.sessionId, taskId, outcome })]));
  }
  finish(runId: string, outcome: RunOutcome, result: RuntimeV2JsonValue = null): Promise<TaskSnapshot> {
    return this.#serialize(async () => {
      this.#active(runId);
      await this.#commit([eventCandidate(RUN_EVENT, { op: "finish", sessionId: this.session.header.sessionId, runId, outcome, result })]);
      return this.#snapshot;
    });
  }

  #claimEvents(task: TaskRecord, runId: string): readonly SessionEventCandidateV1[] {
    return [eventCandidate(TASK_EVENT, { op: "claim", sessionId: this.session.header.sessionId, taskId: task.taskId, runId }), {
      type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: task.taskId, agentRunId: runId },
      surface: { kind: "append", node: { kind: "user", messageId: task.taskId, content: task.content && typeof task.content === "object" && !Array.isArray(task.content) && "kind" in task.content && task.content.kind === "composer-task" ? task.content.prepared : task.content } },
      provenance: { sourceEventSeqs: [task.acceptedSeq], contributorIds: [TASK_OWNER_ID], runtimeSelectionSeq: null },
    }];
  }
  async #commit(events: readonly SessionEventCandidateV1[]): Promise<void> {
    try {
      const accepted = await this.session.appendMany(events);
      const next = projectTasks(this.session.header.sessionId, this.session.journal.events);
      await this.session.flush(accepted.at(-1)!.seq);
      this.#snapshot = next;
      for (const listener of this.#listeners) { try { listener(next); } catch { /* observation cannot invalidate a durable commit */ } }
    } catch (cause) {
      // The in-memory Journal may already contain accepted but undurable events.
      // Do not retry against it or report them through snapshots as committed.
      this.#failure = cause; this.#blocked = true;
      throw new TaskError("DURABILITY_BLOCKED", this.#snapshot, { cause });
    }
  }
  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(() => {
      if (this.#blocked) throw new TaskError("DURABILITY_BLOCKED", this.#snapshot, { cause: this.#failure });
      return operation();
    });
    this.#tail = result.catch(() => undefined);
    return result;
  }
  #receipt(taskId: string): TaskReceipt { return Object.freeze({ task: this.#task(taskId), revision: this.#snapshot.revision, durableSeq: this.session.durableSeq }); }
  #revision(expected: number): void { if (expected !== this.#snapshot.revision) this.#error("REVISION_CONFLICT"); }
  #task(id: string): TaskRecord { const task = this.#snapshot.tasks.find(item => item.taskId === id); if (!task) this.#error("TASK_NOT_FOUND"); return task; }
  #pending(id: string): TaskRecord { const task = this.#task(id); if (task.state !== "pending") this.#error("TASK_NOT_PENDING"); return task; }
  #active(id: string): void { if (!this.#snapshot.runs.some(run => run.runId === id && run.state === "running")) this.#error("RUN_NOT_ACTIVE"); }
  #error(code: ConstructorParameters<typeof TaskError>[0]): never { throw new TaskError(code, this.#snapshot); }
}
const TASK_OWNER_ID = "actspace.agent-service";
function canonical(value: RuntimeV2JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key]!)}`).join(",")}}`;
}
