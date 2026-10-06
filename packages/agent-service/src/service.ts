/**
 * Host observation contract. Handlers read committed snapshots; they never own writes.
 */
export interface AgentServiceEvents {
  /** @mode emit */
  "agent/tasks-updated": (snapshot: import("./contracts.js").TaskSnapshot) => void;
}

declare module "@actspace/cordis-adapter" {
  interface DomainEvents extends AgentServiceEvents {}
}

import type { SessionHandle } from "@actspace/session-persistence";
import { SessionError } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { TaskReceipt, TaskSnapshot, RunRecord, TaskRecord } from "./contracts.js";
import { SessionRunManager, type ExecutionConfiguration, type RunLease } from "./run-manager.js";
import { TaskLedger } from "./task-ledger.js";

export interface AgentServicePorts {
  openSession(sessionId: string): Promise<SessionHandle>;
  operationForTask?(session: SessionHandle, task: TaskRecord): ((signal: AbortSignal) => Promise<RuntimeV2JsonValue | void>) | undefined;
  runIdForTask?(sessionId: string, task: TaskRecord): string | undefined;
  harnessId(session: SessionHandle): string;
  acquire(harnessId: string, signal?: AbortSignal): RunLease | Promise<RunLease>;
  readConfiguration(session: SessionHandle): ExecutionConfiguration | Promise<ExecutionConfiguration>;
  onSnapshot?(sessionId: string, snapshot: TaskSnapshot): void;
  onFailure?(sessionId: string, error: unknown): void;
}

/** Host-scoped application owner. Opening a Session never creates a Loop or lease. */
export class AgentService {
  readonly #sessions = new Map<string, Promise<SessionRunManager>>();
  #closed = false;
  #draining = false;
  #closing: Promise<void> | undefined;
  constructor(private readonly ports: AgentServicePorts) {}

  async submit(sessionId: string, submissionId: string, content: RuntimeV2JsonValue, continuationOf: string | null = null): Promise<TaskReceipt> {
    const manager = await this.#manager(sessionId);
    if (this.#draining) throw new Error("HOST_DRAINING");
    return manager.submit(submissionId, content, continuationOf);
  }
  async snapshot(sessionId: string): Promise<TaskSnapshot> { return (await this.#manager(sessionId)).ledger.snapshot(); }
  async designate(sessionId: string, taskId: string, runId: string | null, revision: number): Promise<TaskSnapshot> {
    const manager = await this.#manager(sessionId);
    const snapshot = await manager.ledger.designate(taskId, runId, revision);
    manager.kick(); return snapshot;
  }
  async cancel(sessionId: string, taskId: string, revision: number): Promise<TaskSnapshot> {
    const manager = await this.#manager(sessionId);
    const snapshot = await manager.ledger.cancel(taskId, revision);
    manager.kick(); return snapshot;
  }
  async move(sessionId: string, taskId: string, beforeTaskId: string, revision: number): Promise<TaskSnapshot> {
    const manager = await this.#manager(sessionId);
    const snapshot = await manager.ledger.move(taskId, beforeTaskId, revision);
    manager.kick(); return snapshot;
  }
  async resume(sessionId: string, revision: number): Promise<void> {
    const manager = await this.#manager(sessionId);
    if (this.#draining) throw new Error("HOST_DRAINING");
    await manager.resume(revision);
  }
  /** Stop queue claims without aborting owned Runs or their approval waits. */
  beginDrain(): void { this.#draining = true; }
  get draining(): boolean { return this.#draining; }
  async waitForOwnedRuns(): Promise<void> {
    if (!this.#draining) throw new Error("Begin draining before waiting for Host idle");
    const managers = await Promise.allSettled(this.#sessions.values());
    // Failed opens own no Run. Keep their recovery failure cached, but drain every
    // successfully opened manager and propagate failures from its running work.
    await Promise.all(managers.flatMap(result => result.status === "fulfilled" ? [result.value.waitForIdle()] : []));
  }
  async stop(sessionId: string, runId: string): Promise<boolean> { return (await this.#manager(sessionId)).stop(runId); }
  async exclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> { return (await this.#manager(sessionId)).exclusive(operation); }
  async waitForTask(sessionId: string, taskId: string): Promise<RunRecord | null> {
    const manager = await this.#manager(sessionId);
    if (manager.blocked) throw manager.failure ?? new Error("DURABILITY_BLOCKED");
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      let unsubscribeFailure = () => {};
      const cleanup = () => { unsubscribe(); unsubscribeFailure(); };
      const check = (snapshot: TaskSnapshot) => {
        const task = snapshot.tasks.find(item => item.taskId === taskId);
        if (!task) { cleanup(); reject(new Error("Task does not exist")); return; }
        if (task.state === "pending" || task.state === "claimed") return;
        cleanup();
        const result = snapshot.runs.find(run => run.runId === task.runId) ?? null;
        void manager.waitForSettlement(task.runId).then(() => resolve(result), reject);
      };
      unsubscribeFailure = manager.subscribeFailure(error => { cleanup(); reject(error); });
      unsubscribe = manager.ledger.subscribe(check);
      check(manager.ledger.snapshot());
    });
  }
  async waitForIdle(sessionId: string): Promise<void> { await (await this.#manager(sessionId)).waitForIdle(); }
  dispose(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    return this.#closing = (async () => {
      const managers = await Promise.allSettled(this.#sessions.values());
      const results = await Promise.allSettled(managers.flatMap(result => result.status === "fulfilled" ? [result.value.dispose()] : []));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Agent service shutdown failed");
    })();
  }
  #manager(sessionId: string): Promise<SessionRunManager> {
    if (this.#closed) return Promise.reject(new Error("Agent service is closed"));
    const existing = this.#sessions.get(sessionId);
    if (existing) return existing;
    let acquired = false;
    const opening = (async () => {
      const session = await this.ports.openSession(sessionId);
      acquired = true;
      if (session.header.sessionId !== sessionId) throw new Error("Session owner mismatch");
      const ledger = await TaskLedger.open(session);
      ledger.subscribe(snapshot => this.ports.onSnapshot?.(sessionId, snapshot));
      return new SessionRunManager({ ledger, canStart: () => !this.#draining, operationForTask: task => this.ports.operationForTask?.(session, task), runIdForTask: task => this.ports.runIdForTask?.(sessionId, task), harnessId: this.ports.harnessId(session), acquire: (id, signal) => this.ports.acquire(id, signal), readConfiguration: () => this.ports.readConfiguration(session), onFailure: error => this.ports.onFailure?.(sessionId, error) });
    })();
    // Only an unacquired writer lease may be retried by the next request.
    // Recovery and durability failures remain cached to protect accepted writes.
    this.#sessions.set(sessionId, opening);
    void opening.catch(error => {
      if (!acquired && error instanceof SessionError && error.code === "SESSION_WRITER_LOCKED" && this.#sessions.get(sessionId) === opening) this.#sessions.delete(sessionId);
    });
    return opening;
  }
}
