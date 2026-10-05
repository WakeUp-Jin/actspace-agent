import type { AgentRunResult, RuntimeStreamEvent } from "@actspace/shared";
import type { SubmitTaskInput, TaskCommand, TaskConfiguration, TaskSnapshot } from "@actspace/shared/runtime-v2";

/** Execution callback input is fixture-only; production accepts SubmitTaskInput. */
export type FixtureRunInput = Omit<SubmitTaskInput, "submissionId"> & {
  agentRunId: string;
  mode?: import("@actspace/shared").ComposerMode;
  selectedSkills?: string[];
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: import("@actspace/shared").ModelReasoningEffort;
};

export type FixtureCompactionInput = {
  sessionId: string;
  agentRunId: string;
  model?: import("@actspace/shared").ModelId;
  modelKey?: import("@actspace/shared").ModelKey;
};

export type FixtureCompactionResult = {
  sessionId: string;
  agentRunId: string;
  status: "compacted" | "skipped" | "failed";
  events: import("@actspace/shared").SessionEvent[];
  contextSnapshot: import("@actspace/shared").ContextUsageSnapshot;
  contextState?: import("@actspace/shared").ContextState | null;
  error?: {
    code: string;
    message: string;
  };
};


/** Renderer fixture: submission receipt and Host execution have independent lifetimes. */
export function taskHostFixture(bridge: Record<string, any> & { execute?: (input: FixtureRunInput) => Promise<AgentRunResult> }): Window["actspace"] {
  const { execute, executeCompaction, prepare, ...api } = bridge;
  const states = new Map<string, TaskSnapshot>();
  const configs = new Map<string, TaskConfiguration>();
  const streams = new Set<(event: RuntimeStreamEvent) => void>();
  const live = new Set<(event: any) => void>();
  const pendingOperations = new Map<string, () => void>();
  const state = (id: string): TaskSnapshot => states.get(id) ?? { sessionId: id, revision: 0, paused: false, tasks: [], queue: [], runs: [] };
  const emit = (event: RuntimeStreamEvent) => { for (const fn of streams) fn(event); };
  const publish = (value: TaskSnapshot) => { states.set(value.sessionId, { ...value, revision: state(value.sessionId).revision + 1 }); for (const fn of live) fn({ event: { sessionId: value.sessionId, message: "task-queue-updated" } }); };
  return {
    ...api,
    onAgentStream: (fn: (event: RuntimeStreamEvent) => void) => { streams.add(fn); const unsub = api.onAgentStream?.(fn); return () => { streams.delete(fn); unsub?.(); }; },
    onSessionLiveEvent: (fn: (event: any) => void) => { live.add(fn); const unsub = api.onSessionLiveEvent?.(fn); return () => { live.delete(fn); unsub?.(); }; },
    getSessionPage: async (input: { sessionId: string }) => api.getSessionPage(input),
    taskCommand: async (input: TaskCommand) => {
      if (input.op === "resume") {
        publish({ ...state(input.sessionId), paused: false });
        const resume = pendingOperations.get(input.sessionId);
        pendingOperations.delete(input.sessionId);
        resume?.();
      }
      if (input.op === "configure") configs.set(input.sessionId, input.configuration);
      if (input.op === "stop") { publish({ ...state(input.sessionId), paused: true }); await api.abortAgentRun?.({ sessionId: input.sessionId, agentRunId: input.runId }); }
      return { snapshot: state(input.sessionId) };
    },
    submitTask: async (input: SubmitTaskInput) => {
      const rejection = await prepare?.(input);
      if (rejection) return rejection;
      const current = state(input.sessionId);
      const existing = current.tasks.find(task => task.submissionId === input.submissionId);
      if (existing) return { task: existing, revision: current.revision, durableSeq: current.revision };
      const runId = `host-${input.submissionId}`;
      const task = { taskId: input.submissionId, submissionId: input.submissionId, acceptedSeq: current.revision + 1, state: "claimed" as const, targetRunId: null, runId, continuationOf: null, content: { kind: "composer-task", original: input, prepared: input.userInput } };
      if (input.userInput.trim() === "/compact") {
        const operationTask = { ...task, runId: null, state: current.paused ? "pending" as const : "claimed" as const };
        publish({ ...current, tasks: [...current.tasks, operationTask], queue: current.paused ? [...current.queue, task.taskId] : current.queue });
        const executeOperation = () => {
          publish({ ...state(input.sessionId), queue: state(input.sessionId).queue.filter(id => id !== task.taskId), tasks: state(input.sessionId).tasks.map(item => item.taskId === task.taskId ? { ...item, state: "claimed" } : item) });
          void Promise.resolve().then(() => executeCompaction?.({ sessionId: input.sessionId, agentRunId: task.taskId })).then(result => {
            publish({ ...state(input.sessionId), tasks: state(input.sessionId).tasks.map(item => item.taskId === task.taskId ? { ...item, state: "completed", result: { compacted: result?.status !== "skipped" } } : item) });
          }, error => {
            publish({ ...state(input.sessionId), paused: true, tasks: state(input.sessionId).tasks.map(item => item.taskId === task.taskId ? { ...item, state: "failed", result: { error: error.message } } : item) });
          });
        };
        if (current.paused) pendingOperations.set(input.sessionId, executeOperation);
        else executeOperation();
        return { task: operationTask, revision: state(input.sessionId).revision, durableSeq: state(input.sessionId).revision };
      }
      publish({ ...current, tasks: [...current.tasks, task], runs: [...current.runs, { runId, taskId: task.taskId, state: "running", result: null, configuration: {}, harness: { harnessId: "main", generationId: "fixture", revision: 1 } }] });
      emit({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: runId });
      const configuration = configs.get(input.sessionId) ?? {};
      void execute?.({ ...input, mode: "agent", ...configuration, selectedSkills: [...configuration.selectedSkillIds ?? []], agentRunId: runId } as FixtureRunInput).then(async result => {
        const record = await api.getSession({ sessionId: input.sessionId });
        if (record && result.events?.length) Object.assign(record, { events: result.events, messageBlocks: undefined, contextSnapshot: result.contextSnapshot });
        const outcome = result.status === "aborted" ? "cancelled" : result.status;
        publish({ ...state(input.sessionId), runs: state(input.sessionId).runs.map(run => run.runId === runId ? { ...run, state: outcome } : run), tasks: state(input.sessionId).tasks.map(item => item.taskId === task.taskId ? { ...item, state: outcome } : item) });
        emit({ type: result.status === "completed" ? "agent_run_finished" : result.status === "aborted" ? "agent_run_aborted" : "agent_run_failed", sessionId: input.sessionId, agentRunId: runId } as RuntimeStreamEvent);
      }, error => {
        publish({ ...state(input.sessionId), paused: true, runs: state(input.sessionId).runs.map(run => run.runId === runId ? { ...run, state: "failed" } : run), tasks: state(input.sessionId).tasks.map(item => item.taskId === task.taskId ? { ...item, state: "failed" } : item) });
        emit({ type: "agent_run_failed", sessionId: input.sessionId, agentRunId: runId, error: { code: "RUNTIME_ERROR", message: error.message, recoverable: false } });
      });
      return { task, revision: state(input.sessionId).revision, durableSeq: state(input.sessionId).revision };
    },
  } as Window["actspace"];
}
