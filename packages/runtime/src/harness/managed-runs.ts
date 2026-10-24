import { taskOperation } from "@actspace/shared/runtime-v2";
import { randomUUID } from "node:crypto";
import { AgentService, type ExecutionConfiguration, type TaskSnapshot } from "@actspace/agent-service";
import type { HarnessLease } from "@actspace/boot";
import { MainAgentInbox } from "@actspace/core-agent";
import type { SessionHandle } from "@actspace/session-persistence";
import type { RuntimeV2RunTurnRequest, RuntimeV2RunTurnResponse } from "@actspace/shared/runtime-v2";
import type { RuntimeSessionController } from "../session/session-controller.js";

/** Binds Host configuration and Harness capabilities to the shared task scheduler. */
export class ManagedRuns {
  readonly service: AgentService;
  readonly #requestedRunIds = new Map<string, string>();
  readonly #settings = new Map<string, Omit<ExecutionConfiguration, "mode">>();
  readonly #states = new Map<string, TaskSnapshot>();
  #closed = false;
  constructor(private readonly sessions: RuntimeSessionController, private readonly harnesses: { acquire(id: string, signal?: AbortSignal): Promise<HarnessLease> | HarnessLease; acquireSession?(sessionId: string, signal?: AbortSignal): Promise<HarnessLease>; acquireVersion?(harnessId: string, generationId: string): Promise<HarnessLease> }, onSnapshot?: (snapshot: TaskSnapshot) => void, background?: { reconcile(session: SessionHandle): Promise<void> }) {
    this.service = new AgentService({
      openSession: async id => {
        const session = sessions.getOpen(id) ?? await sessions.resume(id);
        await background?.reconcile(session);
        return session;
      },
      hasPendingNotifications: session => new MainAgentInbox(session).hasPendingNotifications(),
      runIdForTask: (sessionId, task) => { const key = `${sessionId}/${task.submissionId}`; const id = this.#requestedRunIds.get(key); this.#requestedRunIds.delete(key); return id; },
      operationForTask: (session, task) => {
        if (taskOperation(task.content) !== "compact") return undefined;
        return async signal => {
          const lease = await (harnesses.acquireSession?.(session.header.sessionId, signal) ?? harnesses.acquire("main", signal));
          try {
            signal.throwIfAborted();
            const compaction = lease.getService<{ compaction: import("@actspace/context-engine").ContextCompactionCoordinator }>("context.engine")?.compaction;
            if (!compaction) throw new Error("Harness does not provide compaction");
            return { compacted: await compaction.compact(session, { signal }) };
          } finally { await lease.release(); }
        };
      },
      harnessId: session => session.header.sessionId, acquire: (id, signal) => harnesses.acquireSession?.(id, signal) ?? harnesses.acquire("main", signal),
      readConfiguration: session => ({ ...this.#settings.get(session.header.sessionId), mode: sessions.snapshot(session).agentMode ?? "agent" }),
      onSnapshot: (id, snapshot) => { this.#states.set(id, snapshot); onSnapshot?.(snapshot); },
    });
  }
  async inspectCapability<T, R>(name: string, inspect: (service: T | undefined) => R, sessionId?: string): Promise<R> {
    const active = sessionId ? this.#states.get(sessionId)?.runs.find(run => run.state === "running") : undefined;
    const selected = () => sessionId ? this.harnesses.acquireSession?.(sessionId) ?? this.harnesses.acquire("main") : this.harnesses.acquire("main");
    const lease = await (active && this.harnesses.acquireVersion ? this.harnesses.acquireVersion(active.harness.harnessId, active.harness.generationId).catch(error => {
      // A Run may settle while this read waits behind the Control gate.
      if (this.#states.get(sessionId!)?.runs.some(run => run.runId === active.runId && run.state === "running")) throw error;
      return selected();
    }) : selected());
    try { return inspect(lease.getService<T>(name)); } finally { await lease.release(); }
  }

  configuration(sessionId: string): Omit<ExecutionConfiguration, "mode"> { return structuredClone(this.#settings.get(sessionId) ?? {}); }
  configure(sessionId: string, configuration: Omit<ExecutionConfiguration, "mode">): void {
    if (this.#closed) throw new Error("Agent service is closed");
    const clean = Object.fromEntries(Object.entries(configuration).filter(([, value]) => value !== undefined)) as Omit<ExecutionConfiguration, "mode">;
    if (clean.durationMs !== undefined && (!Number.isFinite(clean.durationMs) || clean.durationMs < 0)) throw new Error("Invalid execution duration");
    if (clean.deadline !== undefined && !Number.isFinite(clean.deadline)) throw new Error("Invalid execution deadline");
    this.#settings.set(sessionId, structuredClone(clean));
  }
  async initialize(sessionId: string): Promise<void> {
    this.#states.set(sessionId, await this.service.snapshot(sessionId));
  }
  async run(sessionId: string, input: Omit<RuntimeV2RunTurnRequest, "sessionId">, signal?: AbortSignal): Promise<RuntimeV2RunTurnResponse> {
    const session = this.sessions.getOpen(sessionId) ?? await this.sessions.resume(sessionId);
    await this.initialize(sessionId);
    this.configure(sessionId, { ...(input.model === undefined ? {} : { model: input.model }), ...(input.thinkingEnabled === undefined ? {} : { thinkingEnabled: input.thinkingEnabled }), ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }), ...(input.selectedSkillIds === undefined ? {} : { selectedSkillIds: input.selectedSkillIds }) });
    signal?.throwIfAborted();
    const submissionId = input.messageId ?? randomUUID();
    if (input.agentRunId) this.#requestedRunIds.set(`${sessionId}/${submissionId}`, input.agentRunId);
    const receipt = await this.service.submit(sessionId, submissionId, input.content).finally(() => this.#requestedRunIds.delete(`${sessionId}/${submissionId}`));
    const cancel = () => { void this.service.snapshot(sessionId).then(async state => {
      const task = state.tasks.find(item => item.taskId === receipt.task.taskId);
      if (task?.state === "claimed" && task.runId) { await this.service.stop(sessionId, task.runId); return; }
      // A delayed signal belongs to this submission, never the next active Run.
      if (task?.state === "pending") { await this.service.cancel(sessionId, task.taskId, state.revision); }
      return undefined;
    }).catch(() => undefined); };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const run = await this.service.waitForTask(sessionId, receipt.task.taskId).finally(() => signal?.removeEventListener("abort", cancel));
    if (run?.state === "running") throw new Error("Task settlement returned an active Run.");
    const task = (await this.service.snapshot(sessionId)).tasks.find(item => item.taskId === receipt.task.taskId);
    if (!task || task.state === "pending" || task.state === "claimed") throw new Error("Task did not reach a terminal state.");
    return { sessionId, taskId: receipt.task.taskId, agentRunId: run?.runId ?? null,
      outcome: run?.state ?? task.state, value: run?.result ?? null, snapshot: this.sessions.snapshot(session) };
  }
  isActive(sessionId: string): boolean { return this.#states.get(sessionId)?.runs.some(run => run.state === "running") ?? false; }
  abort(sessionId: string): boolean {
    const runId = this.#states.get(sessionId)?.runs.find(run => run.state === "running")?.runId;
    if (!runId) return false;
    // Legacy synchronous callers receive admission; new transport uses await service.stop(runId).
    void this.service.stop(sessionId, runId).catch(() => undefined); return true;
  }
  isIdle(): boolean { return [...this.#states.values()].every(state => !state.queue.length && state.runs.every(run => run.state !== "running")); }
  quiesce(): void { this.#closed = true; void this.service.dispose().catch(() => undefined); }
  async dispose(): Promise<void> { this.#closed = true; await this.service.dispose(); }
}
