import { randomUUID } from "node:crypto";
import { AgentService, type ExecutionConfiguration, type TaskSnapshot } from "@actspace/agent-service";
import type { HarnessLease } from "@actspace/boot";
import type { SessionHandle } from "@actspace/session-persistence";
import type { RuntimeV2JsonValue, RuntimeV2RunTurnRequest, RuntimeV2RunTurnResponse } from "@actspace/shared/runtime-v2";
import type { RunTurnResult } from "@actspace/core-agent";
import type { RuntimeSessionController } from "./session-controller.js";

/** Compatibility operations for application adapters; all execution belongs to AgentService. */
export class ManagedRuns {
  readonly service: AgentService;
  readonly #requestedRunIds = new Map<string, string>();
  readonly #settings = new Map<string, Omit<ExecutionConfiguration, "mode">>();
  readonly #states = new Map<string, TaskSnapshot>();
  readonly #sessions = new Map<string, SessionHandle>();
  #closed = false;
  constructor(private readonly sessions: RuntimeSessionController, private readonly harnesses: { acquire(id: string, signal?: AbortSignal): Promise<HarnessLease> | HarnessLease }, onSnapshot?: (snapshot: TaskSnapshot) => void) {
    this.service = new AgentService({
      openSession: async id => { const session = sessions.getOpen(id) ?? await sessions.resume(id); this.#sessions.set(id, session); return session; },
      runIdForTask: (sessionId, task) => { const key = `${sessionId}/${task.submissionId}`; const id = this.#requestedRunIds.get(key); this.#requestedRunIds.delete(key); return id; },
      operationForTask: (session, task) => {
        const value = task.content as import("@actspace/shared/runtime-v2").TaskContentEnvelope;
        const original = value?.kind === "composer-task" ? value.original as { userInput?: string } : null;
        if (original?.userInput?.trim() !== "/compact") return undefined;
        return async signal => {
          const lease = await harnesses.acquire("main", signal);
          try {
            signal.throwIfAborted();
            const compaction = lease.getService<import("@actspace/compaction").CompactionPlugin>("compaction.runtime");
            if (!compaction) throw new Error("Harness does not provide compaction");
            await compaction.compact(session);
          } finally { await lease.release(); }
        };
      },
      harnessId: () => "main", acquire: (id, signal) => harnesses.acquire(id, signal),
      readConfiguration: session => ({ ...this.#settings.get(session.header.sessionId), mode: sessions.snapshot(session).agentMode ?? "agent" }),
      onSnapshot: (id, snapshot) => { this.#states.set(id, snapshot); onSnapshot?.(snapshot); },
    });
  }
  async inspectCapability<T, R>(name: string, inspect: (service: T | undefined) => R): Promise<R> {
    const lease = await this.harnesses.acquire("main");
    try { return inspect(lease.getService<T>(name)); } finally { await lease.release(); }
  }
  async compact(sessionId: string): Promise<boolean> {
    return this.service.exclusive(sessionId, async () => {
      const lease = await this.harnesses.acquire("main");
      try {
        const compaction = lease.getService<import("@actspace/compaction").CompactionPlugin>("compaction.runtime");
        if (!compaction) throw new Error("Missing compaction service");
        return await compaction.compact(this.sessions.getOpen(sessionId) ?? await this.sessions.resume(sessionId));
      } finally { await lease.release(); }
    });
  }
  configure(sessionId: string, configuration: Omit<ExecutionConfiguration, "mode">): void {
    if (this.#closed) throw new Error("Agent service is closed");
    const clean = Object.fromEntries(Object.entries(configuration).filter(([, value]) => value !== undefined)) as Omit<ExecutionConfiguration, "mode">;
    if (clean.durationMs !== undefined && (!Number.isFinite(clean.durationMs) || clean.durationMs < 0)) throw new Error("Invalid execution duration");
    if (clean.deadline !== undefined && !Number.isFinite(clean.deadline)) throw new Error("Invalid execution deadline");
    this.#settings.set(sessionId, structuredClone(clean));
  }
  async attach(session: SessionHandle) {
    this.#sessions.set(session.header.sessionId, session);
    this.#states.set(session.header.sessionId, await this.service.snapshot(session.header.sessionId));
    return this.get(session.header.sessionId)!;
  }
  get(sessionId: string) {
    const session = this.#sessions.get(sessionId); if (!session) return undefined;
    const owner = this;
    return { session, loop: { get active() { return owner.isActive(sessionId); }, abort: () => owner.abort(sessionId) }, inbox: {
      enqueue: async (content: RuntimeV2JsonValue, target: "next-step" | "next-turn", messageId = randomUUID()) => {
        const receipt = await owner.service.submit(sessionId, messageId, content);
        if (target === "next-step") {
          const current = await owner.service.snapshot(sessionId);
          const runId = current.runs.find(run => run.state === "running")?.runId;
          if (runId && receipt.task.state === "pending") await owner.service.designate(sessionId, receipt.task.taskId, runId, current.revision);
        }
        return { messageId: receipt.task.taskId, target, enqueuedSeq: receipt.task.acceptedSeq };
      },
      discard: async (taskId: string) => {
        const state = await owner.service.snapshot(sessionId);
        if (state.tasks.find(task => task.taskId === taskId)?.state !== "pending") return false;
        await owner.service.cancel(sessionId, taskId, state.revision); return true;
      },
      status: (taskId: string) => { const task = owner.#states.get(sessionId)?.tasks.find(task => task.taskId === taskId); return !task ? null : task.state === "pending" ? "pending" as const : task.state === "cancelled" && !task.runId ? "discarded" as const : "claimed" as const; },
    } };
  }
  async run(sessionId: string, input: Omit<RuntimeV2RunTurnRequest, "sessionId">, signal?: AbortSignal): Promise<RuntimeV2RunTurnResponse> {
    const session = this.sessions.getOpen(sessionId) ?? await this.sessions.resume(sessionId);
    await this.attach(session);
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
    if (!run || !run.result || typeof run.result !== "object" || Array.isArray(run.result) || !("reason" in run.result)) throw new Error(`Task ${receipt.task.taskId} ended without a Loop result: ${run?.state ?? "cancelled"}`);
    return { ...(run.result as RunTurnResult), sessionId, snapshot: this.sessions.snapshot(session) };
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
