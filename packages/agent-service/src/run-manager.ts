import { randomUUID } from "node:crypto";
import { snapshotSessionJson } from "@actspace/session-journal";
import { BACKGROUND_WAKE_KIND, isBackgroundWake, type RuntimeV2JsonValue, type RuntimeV2AgentMode } from "@actspace/shared/runtime-v2";
import { TaskError, type HarnessIdentity, type RunOutcome, type TaskRecord, type TaskReceipt } from "./contracts.js";
import { RunBudget } from "./execution-budget.js";
import { TaskLedger } from "./task-ledger.js";

export const RUN_FACTORY_SERVICE = "agent.run-factory";
export type ExecutionConfiguration = { readonly durationMs?: number; readonly deadline?: number; readonly mode: RuntimeV2AgentMode; readonly model?: string; readonly thinkingEnabled?: boolean; readonly reasoningEffort?: import("@actspace/shared").ModelReasoningEffort; readonly selectedSkillIds?: readonly string[] };
export type RunExecutionResult = { readonly outcome: RunOutcome; readonly value: RuntimeV2JsonValue };
/** Structural port: factory implementations do not depend on the concrete default Loop. */
export interface RunInstance {
  /** Return cancelled for normal interruption; thrown errors remain failures even after abort. */
  execute(): Promise<RunExecutionResult>;
  /** Must await all owned work stopping before resolving. */
  dispose(): Promise<void>;
}
export interface RunFactory {
  create(input: {
    readonly session: TaskLedger["session"];
    readonly scope: import("@actspace/core-scope").AgentScope;
    readonly context: import("@actspace/cordis-adapter").CordisContext;
    readonly runId: string;
    readonly initial: TaskRecord;
    readonly configuration: ExecutionConfiguration;
    readonly signal: AbortSignal;
    readonly budget?: Pick<RunBudget, "waitForApproval" | "settleApproval">;
    readonly hasPendingSupplements: () => boolean;
    readonly claimSupplements: () => Promise<{ readonly tasks: readonly TaskRecord[]; readonly configuration: ExecutionConfiguration }>;
  }): Promise<RunInstance>;
}
export interface RunLease extends HarnessIdentity {
  readonly executionDigest?: string;
  readonly scope: import("@actspace/core-scope").AgentScope;
  readonly context: import("@actspace/cordis-adapter").CordisContext;
  getService<T>(name: string): T | undefined;
  release(): Promise<void>;
}
export type RunManagerOptions = {
  /** Host admission gate, checked before reserving a Run. */
  readonly canStart?: () => boolean;
  readonly ledger: TaskLedger;
  readonly harnessId: string | (() => string);
  readonly operationForTask?: (task: TaskRecord) => ((signal: AbortSignal) => Promise<RuntimeV2JsonValue | void>) | undefined;
  readonly runIdForTask?: (task: TaskRecord) => string | undefined;
  readonly acquire: (harnessId: string, signal?: AbortSignal) => RunLease | Promise<RunLease>;
  readonly readConfiguration: () => ExecutionConfiguration | Promise<ExecutionConfiguration>;
  /** Undelivered background notifications in the Session Inbox. */
  readonly hasPendingNotifications?: () => boolean;
  readonly onFailure?: (error: unknown) => void;
};
type ActiveRun = { readonly runId: string; readonly taskId: string; readonly controller: AbortController; readonly done: Promise<void> };

/** One owner per Session; persistent acceptance is separate from the execution promise. */
export class SessionRunManager {
  readonly ledger: TaskLedger;
  #active: ActiveRun | undefined;
  readonly #failureListeners = new Set<(error: unknown) => void>();
  subscribeFailure(listener: (error: unknown) => void): () => void { this.#failureListeners.add(listener); return () => { this.#failureListeners.delete(listener); }; }
  get blocked(): boolean { return this.#failed || this.ledger.blocked; }
  #maintenance: Promise<unknown> | undefined;
  #closed = false;
  #closing: Promise<void> | undefined;
  #failure: unknown;
  #failed = false;
  #waking = false;
  /** A wake Run that did not complete must not retry itself; the next user action re-arms it. */
  #wakeSuspended = false;
  constructor(private readonly options: RunManagerOptions) { this.ledger = options.ledger; }
  get failure(): unknown { return this.#failure; }

  async submit(submissionId: string, content: RuntimeV2JsonValue, continuationOf: string | null = null): Promise<TaskReceipt> {
    this.#assertOpen();
    if (!isBackgroundWake(content)) this.#wakeSuspended = false;
    const receipt = await this.ledger.submit(submissionId, content, continuationOf);
    this.kick();
    return receipt;
  }
  async resume(expectedRevision: number): Promise<void> {
    this.#assertOpen();
    if (this.#failed) throw this.#failure;
    await this.ledger.setPaused(false, expectedRevision);
    this.#wakeSuspended = false;
    this.wake();
    this.kick();
  }
  async stop(runId: string): Promise<boolean> {
    const active = this.#active;
    if (!active || active.runId !== runId) return false;
    // Stop must not let queued work escape even when the current Run is settling.
    try { await this.ledger.pause(); }
    catch (error) {
      active.controller.abort("host-stop");
      throw error;
    }
    active.controller.abort("host-stop");
    return true;
  }
  async waitForSettlement(runId: string | null): Promise<void> {
    const active = this.#active;
    if (active && (runId === null || active.runId === runId)) await active.done;
    if (this.#failed) throw this.#failure;
  }
  async waitForIdle(): Promise<void> {
    while (this.#active || this.#maintenance) await (this.#active?.done ?? this.#maintenance);
  }
  /** Reserve the same scheduling slot for mode/workspace updates and manual compaction. */
  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertOpen();
    if (this.#active || this.#maintenance) return Promise.reject(new TaskError("SESSION_BUSY", this.ledger.snapshot()));
    const work = Promise.resolve().then(operation);
    this.#maintenance = work;
    return work.finally(() => { this.#maintenance = undefined; this.wake(); this.kick(); });
  }
  dispose(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    this.#active?.controller.abort("host-shutdown");
    return this.#closing = this.waitForIdle().then(() => {
      for (const listener of this.#failureListeners) { try { listener(new Error("Agent service is closed")); } catch { /* observer */ } }
      if (this.#failed) throw this.#failure;
    });
  }

  /**
   * Deliver background notifications to an idle Session. User work, a pause
   * (the user stopped the last Run) or drain all take precedence.
   */
  wake(): void {
    if (this.#waking || this.#wakeSuspended || this.#closed || this.#maintenance || this.#active || this.#failed || this.ledger.blocked || this.options.canStart?.() === false) return;
    const snapshot = this.ledger.snapshot();
    if (snapshot.paused || snapshot.queue.length || snapshot.runs.some(run => run.state === "running") || !this.options.hasPendingNotifications?.()) return;
    this.#waking = true;
    void this.submit(`background-wake:${randomUUID()}`, { kind: BACKGROUND_WAKE_KIND })
      .catch(error => { try { this.options.onFailure?.(error); } catch { /* observer */ } })
      .finally(() => { this.#waking = false; });
  }

  /** Called after queue edits or initial acceptance; never blocks an acceptance receipt. */
  kick(): void {
    if (this.#closed || this.#maintenance || this.#active || this.#failed || this.ledger.blocked || this.options.canStart?.() === false) return;
    const snapshot = this.ledger.snapshot();
    if (snapshot.paused || snapshot.runs.some(run => run.state === "running")) return;
    const task = snapshot.queue.map(id => snapshot.tasks.find(item => item.taskId === id)!).find(item => item.targetRunId === null);
    if (!task) return;
    const runId = this.options.runIdForTask?.(task) ?? randomUUID();
    const controller = new AbortController();
    // Reserve ownership synchronously before the factory/configuration can yield.
    const operation = this.options.operationForTask?.(task);
    const done = Promise.resolve().then(() => operation ? this.#executeOperation(task, operation, controller.signal) : this.#execute(task, runId, controller)).catch(error => {
      this.#failure = error; this.#failed = true;
      for (const listener of this.#failureListeners) { try { listener(error); } catch { /* observer */ } }
      try { this.options.onFailure?.(error); } catch { /* observation cannot restart work */ }
    }).finally(() => {
      this.#active = undefined;
      if (isBackgroundWake(task.content) && this.ledger.snapshot().runs.find(run => run.runId === runId)?.state !== "completed") this.#wakeSuspended = true;
      this.wake(); this.kick();
    });
    this.#active = { runId, taskId: task.taskId, controller, done };
  }

  async #executeOperation(task: TaskRecord, operation: (signal: AbortSignal) => Promise<RuntimeV2JsonValue | void>, signal: AbortSignal): Promise<void> {
    let started = false;
    try {
      signal.throwIfAborted();
      await this.ledger.startOperation(task.taskId); started = true;
      const result = await operation(signal);
      await this.ledger.finishOperation(task.taskId, signal.aborted ? "cancelled" : "completed", result ?? null);
    } catch (error) {
      if (started && !this.ledger.blocked) await this.ledger.finishOperation(task.taskId, signal.aborted ? "cancelled" : "failed", { error: error instanceof Error ? error.message : String(error) });
      else if (error instanceof TaskError && ["QUEUE_PAUSED", "QUEUE_ORDER", "TASK_NOT_PENDING", "SESSION_BUSY"].includes(error.code)) return;
      if (!started || this.ledger.blocked) throw error;
      try { this.options.onFailure?.(error); } catch { /* observation only */ }
    }
  }
  async #execute(task: TaskRecord, runId: string, controller: AbortController): Promise<void> {
    const signal = controller.signal;
    let budget: RunBudget | undefined;
    let lease: RunLease | undefined;
    let instance: RunInstance | undefined;
    let started = false;
    let result: RunExecutionResult = { outcome: "failed", value: null };
    const errors: unknown[] = [];
    let fatal = false;
    let disposed = true;
    let lostClaim = false;
    let executing = false;
    let acquiring = false;
    try {
      const beforeAcquire = await this.options.readConfiguration();
      signal.throwIfAborted();
      if (beforeAcquire.deadline !== undefined && beforeAcquire.deadline <= Date.now()) {
        await this.ledger.startOperation(task.taskId);
        await this.ledger.finishOperation(task.taskId, "cancelled");
        return;
      }
      acquiring = true;
      lease = await this.options.acquire(typeof this.options.harnessId === "function" ? this.options.harnessId() : this.options.harnessId, signal);
      acquiring = false;
      signal.throwIfAborted();
      const configuration = snapshotSessionJson(await this.options.readConfiguration());
      signal.throwIfAborted();
      if (configuration.deadline !== undefined && configuration.deadline <= Date.now()) {
        await this.ledger.startOperation(task.taskId);
        await this.ledger.finishOperation(task.taskId, "cancelled");
        return;
      }
      const factory = lease.getService<RunFactory>(RUN_FACTORY_SERVICE);
      if (!factory) throw new Error(`Harness ${lease.harnessId} does not provide ${RUN_FACTORY_SERVICE}`);
      const initial = await this.ledger.start(task.taskId, runId, { harnessId: lease.harnessId, generationId: lease.generationId, revision: lease.revision }, { ...configuration, ...(lease.executionDigest ? { harnessExecutionDigest: lease.executionDigest } : {}) } as RuntimeV2JsonValue);
      started = true;
      signal.throwIfAborted();
      if (configuration.durationMs !== undefined || configuration.deadline !== undefined) budget = new RunBudget(configuration.durationMs ?? Number.MAX_SAFE_INTEGER, configuration.deadline ?? null, () => controller.abort("execution-budget"));
      instance = await factory.create({ session: this.ledger.session, scope: lease.scope, context: lease.context, runId, initial, configuration, signal, budget,
        hasPendingSupplements: () => this.ledger.snapshot().tasks.some(task => task.state === "pending" && task.targetRunId === runId),
        claimSupplements: async () => {
          signal.throwIfAborted();
          const current = snapshotSessionJson(await this.options.readConfiguration());
          const tasks = await this.ledger.claimSupplement(runId);
          return { tasks, configuration: { ...current, mode: configuration.mode } };
        },
      });
      signal.throwIfAborted();
      budget?.start();
      signal.throwIfAborted();
      executing = true;
      result = await instance.execute();
      if (signal.aborted) result = { ...result, outcome: "cancelled" };
    } catch (error) {
      // Once execution begins, normal cancellation is a returned outcome.
      // An exception still signals failure, even if cancellation happened concurrently.
      if (signal.aborted && !executing) result = { outcome: "cancelled", value: null };
      else if (acquiring && ["RECOVERY_BLOCKED", "DURABILITY_BLOCKED", "STORE_LOCKED"].includes((error as { code?: string })?.code ?? "")) {
        // No task was claimed: retain content and permit explicit resume after Host repair.
        await this.ledger.pause(); lostClaim = true;
        for (const listener of this.#failureListeners) { try { listener(error); } catch { /* observer */ } }
        try { this.options.onFailure?.(error); } catch { /* observer */ }
      }
      // A concurrent queue edit or pause won before the initial claim: leave it queued.
      else if (!started && error instanceof TaskError && ["QUEUE_PAUSED", "QUEUE_ORDER", "TASK_NOT_PENDING"].includes(error.code)) lostClaim = true;
      else { errors.push(error); result = { outcome: "failed", value: null }; }
    } finally {
      budget?.dispose();
      // dispose is a stop-and-join barrier; never release a lease while work uses it.
      try { await instance?.dispose(); } catch (error) { disposed = false; fatal = true; errors.push(error); result = { outcome: "failed", value: null }; }
      if (started) {
        try { await this.ledger.finish(runId, result.outcome, result.value); } catch (error) { fatal = true; errors.push(error); }
      } else if (signal.aborted && !this.ledger.blocked) {
        try { await this.ledger.pause(); } catch (error) { fatal = true; errors.push(error); }
      }
      try { if (disposed) await lease?.release(); } catch (error) { fatal = true; errors.push(error); }
    }
    if (errors.length) {
      const failure = new AggregateError(errors, `Run ${runId} failed`);
      if (fatal || !started) throw failure;
      this.#failure = failure;
      try { this.options.onFailure?.(failure); } catch { /* observation only */ }
    }
    if (lostClaim) return;
  }
  #assertOpen(): void { if (this.#closed) throw new Error("Agent service is closed"); if (this.#failed) throw this.#failure; }
}
