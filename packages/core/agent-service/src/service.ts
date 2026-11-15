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
import { SessionError, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { TaskError, type TaskReceipt, type TaskSnapshot, type RunRecord, type TaskRecord } from "./contracts.js";
import { SessionRunManager, type ExecutionConfiguration, type RunLease } from "./run-manager.js";
import { TaskLedger } from "./task-ledger.js";
import { projectTasks } from "./task-projection.js";

export interface AgentServicePorts {
  openSession(sessionId: string): Promise<SessionHandle>;
  operationForTask?(session: SessionHandle, task: TaskRecord): ((signal: AbortSignal) => Promise<RuntimeJsonValue | void>) | undefined;
  runIdForTask?(sessionId: string, task: TaskRecord): string | undefined;
  harnessId(session: SessionHandle): string;
  acquire(harnessId: string, signal?: AbortSignal): RunLease | Promise<RunLease>;
  readConfiguration(session: SessionHandle): ExecutionConfiguration | Promise<ExecutionConfiguration>;
  hasPendingNotifications?(session: SessionHandle): boolean;
  onSnapshot?(sessionId: string, snapshot: TaskSnapshot): void;
  onFailure?(sessionId: string, error: unknown): void;
  /**
   * A Session another provider schedules (a subagent's): its committed events, read without opening it.
   * `undefined` for a Session this service owns. The service never opens such a Session: that would take
   * the writer lease its provider needs to continue it.
   */
  providerOwnedEvents?(sessionId: string): Promise<readonly SessionEventEnvelopeV1[] | undefined>;
}

/** Host-scoped application owner. Opening a Session never creates a Loop or lease. */
export class AgentService {
  readonly #sessions = new Map<string, Promise<SessionRunManager>>();
  readonly #externalLedgers = new Map<string, TaskLedger>();
  /** Managers whose open already settled; release decides on these only, never on a pending open. */
  readonly #settled = new Map<string, SessionRunManager>();
  /** Sessions a rewind holds: tasks may be accepted or cancelled, but no Run starts. */
  readonly #held = new Set<string>();
  #closed = false;
  #draining = false;
  #closing: Promise<void> | undefined;
  constructor(private readonly ports: AgentServicePorts) {}

  async submit(sessionId: string, submissionId: string, content: RuntimeJsonValue, continuationOf: string | null = null): Promise<TaskReceipt> {
    const manager = await this.#manager(sessionId);
    if (this.#draining) throw new Error("HOST_DRAINING");
    return manager.submit(submissionId, content, continuationOf);
  }
  /** Observe a provider-owned Run without taking recovery or scheduling ownership. */
  registerExternalLedger(ledger: TaskLedger): () => void {
    if (this.#closed) throw new Error("Agent service is closed");
    const id = ledger.session.header.sessionId;
    if (this.#sessions.has(id) || this.#externalLedgers.has(id)) throw new TaskError("SESSION_BUSY");
    this.#externalLedgers.set(id, ledger);
    return () => { if (this.#externalLedgers.get(id) === ledger) this.#externalLedgers.delete(id); };
  }
  async snapshot(sessionId: string): Promise<TaskSnapshot> {
    if (this.#closed) throw new Error("Agent service is closed");
    const external = this.#externalLedgers.get(sessionId);
    if (external) return external.snapshot();
    if (!this.#sessions.has(sessionId)) {
      const events = await this.ports.providerOwnedEvents?.(sessionId);
      if (events) return projectTasks(sessionId, events);
    }
    return (await this.#manager(sessionId)).ledger.snapshot();
  }
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
  /** A background notification arrived; open a wake Run if the Session scheduler is idle. */
  wake(sessionId: string): void {
    const manager = this.#sessions.get(sessionId);
    if (!manager || this.#closed || this.#draining) return;
    void manager.then(value => value.wake(), () => undefined);
  }
  /**
   * Hold a Session while it rewinds (agent-edit-resend-rewind.md §3.2): no Run, operation or wake starts
   * until the returned release runs, which then starts whatever is queued. A second hold is `SESSION_BUSY`.
   */
  hold(sessionId: string): () => void {
    if (this.#closed) throw new Error("Agent service is closed");
    if (this.#held.has(sessionId)) throw new TaskError("SESSION_BUSY");
    this.#held.add(sessionId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#held.delete(sessionId);
      const manager = this.#settled.get(sessionId);
      if (manager && !this.#closed) { manager.wake(); manager.kick(); }
    };
  }
  isHeld(sessionId: string): boolean { return this.#held.has(sessionId); }
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
  async exclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    // Mode, workspace and compaction writes wait out a rewind instead of landing in a Journal about to be replaced.
    if (this.#held.has(sessionId)) throw new TaskError("SESSION_BUSY");
    return (await this.#manager(sessionId)).exclusive(operation);
  }
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
  /** True when this service holds nothing a release would lose: no manager, or an idle settled one. */
  canRelease(sessionId: string): boolean {
    if (this.#closed || this.#externalLedgers.has(sessionId)) return false;
    if (!this.#sessions.has(sessionId)) return true;
    return this.#settled.get(sessionId)?.releasable === true;
  }
  /**
   * Drop the Session's manager (ledger and queue state) so the owner can close the Session handle.
   * Check and removal share one synchronous step, so nothing can submit to a manager that is about
   * to lose its Session. Returns false and keeps everything when work is present.
   */
  async release(sessionId: string): Promise<boolean> {
    if (!this.canRelease(sessionId)) return false;
    const manager = this.#settled.get(sessionId);
    if (manager === undefined) return true;
    this.#settled.delete(sessionId);
    this.#sessions.delete(sessionId);
    await manager.dispose().catch(() => undefined);
    return true;
  }
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
    if (this.#externalLedgers.has(sessionId)) return Promise.reject(new TaskError("SESSION_BUSY"));
    const existing = this.#sessions.get(sessionId);
    if (existing) return existing;
    let acquired = false;
    const opening = (async () => {
      if (await this.ports.providerOwnedEvents?.(sessionId)) throw new TaskError("SESSION_BUSY");
      const session = await this.ports.openSession(sessionId);
      acquired = true;
      if (session.header.sessionId !== sessionId) throw new Error("Session owner mismatch");
      const ledger = await TaskLedger.open(session);
      ledger.subscribe(snapshot => this.ports.onSnapshot?.(sessionId, snapshot));
      return new SessionRunManager({ ledger, canStart: () => !this.#draining && !this.#held.has(sessionId), operationForTask: task => this.ports.operationForTask?.(session, task), runIdForTask: task => this.ports.runIdForTask?.(sessionId, task), harnessId: () => this.ports.harnessId(session), acquire: (id, signal) => this.ports.acquire(id, signal), readConfiguration: () => this.ports.readConfiguration(session), hasPendingNotifications: () => this.ports.hasPendingNotifications?.(session) ?? false, onFailure: error => this.ports.onFailure?.(sessionId, error) });
    })();
    // Only an unacquired writer lease may be retried by the next request.
    // Recovery and durability failures remain cached to protect accepted writes.
    this.#sessions.set(sessionId, opening);
    void opening.then(manager => { if (this.#sessions.get(sessionId) === opening) this.#settled.set(sessionId, manager); }, () => undefined);
    void opening.catch(error => {
      const retryable = (error instanceof SessionError && error.code === "SESSION_WRITER_LOCKED") || (error instanceof TaskError && error.code === "SESSION_BUSY");
      if (!acquired && retryable && this.#sessions.get(sessionId) === opening) this.#sessions.delete(sessionId);
    });
    return opening;
  }
}
