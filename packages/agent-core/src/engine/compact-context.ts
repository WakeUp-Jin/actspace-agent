import type {
  CompactContextInput,
  CompactContextResult,
  ContextCompactionPayload,
  RuntimeStreamEvent,
  SessionEvent,
} from "@actspace/shared";
import { createPersistedSessionEvent, contextSnapshotToEvent } from "../adapters";
import type { ContextManager } from "../context/manager";
import type { Summarizer } from "../context/compression/summarizer";
import type { ToolManager } from "../tools/manager";
import { createContextState } from "./bridge";

export interface CompactContextDeps {
  contextManager: ContextManager;
  toolManager: ToolManager;
  summarizer?: Summarizer;
}

export interface CompactContextOptions {
  onStreamEvent?: (event: RuntimeStreamEvent) => void;
}

export async function compactContextWithAgent(
  input: CompactContextInput,
  deps: CompactContextDeps,
  options: CompactContextOptions = {},
): Promise<CompactContextResult> {
  const { sessionId, agentRunId } = input;
  const emit = options.onStreamEvent;

  try {
    emit?.({
      type: "context_compaction_started",
      sessionId,
      agentRunId,
      trigger: "manual",
      stage: "preparing",
    });

    deps.contextManager.setTools(deps.toolManager.getToolDefinitions());

    emit?.({
      type: "context_compaction_progress",
      sessionId,
      agentRunId,
      trigger: "manual",
      stage: "summarizing",
    });

    const report = await deps.contextManager.compactNow(deps.summarizer);
    const payload = createCompactionPayload(report);
    const compactionEvent = createPersistedSessionEvent(sessionId, agentRunId, "context_compaction", payload);

    emit?.({
      type: "context_compaction_progress",
      sessionId,
      agentRunId,
      trigger: "manual",
      stage: "writing",
      summary: createCompactionSummary(payload),
    });

    const contextSnapshot = deps.contextManager.getUsageSnapshot();
    const contextState = createContextState(contextSnapshot, sessionId, agentRunId);
    const snapshotEvent = contextSnapshotToEvent(contextSnapshot, sessionId, agentRunId);
    const events: SessionEvent[] = [compactionEvent, snapshotEvent];

    emit?.({
      type: "context_compaction_finished",
      sessionId,
      agentRunId,
      trigger: "manual",
      stage: "completed",
      status: report.status,
      progress: 1,
      summary: createCompactionSummary(payload),
      payload,
    });

    return {
      sessionId,
      agentRunId,
      status: report.status,
      events,
      contextSnapshot,
      contextState,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sessionError = { code: "COMPACT_CONTEXT_ERROR", message, recoverable: true };
    emit?.({
      type: "context_compaction_failed",
      sessionId,
      agentRunId,
      trigger: "manual",
      stage: "failed",
      error: sessionError,
    });

    const contextSnapshot = deps.contextManager.getUsageSnapshot();
    const contextState = createContextState(contextSnapshot, sessionId, agentRunId);
    return {
      sessionId,
      agentRunId,
      status: "failed",
      events: [],
      contextSnapshot,
      contextState,
      error: sessionError,
    };
  }
}

type CompactReport = Awaited<ReturnType<ContextManager["compactNow"]>>;

function createCompactionPayload(report: CompactReport): ContextCompactionPayload {
  const status = report.status;
  return {
    triggerTokens: report.triggerTokens,
    thresholdTokens: report.thresholdTokens,
    beforeCount: report.beforeCount,
    afterCount: report.afterCount,
    summaryChars: report.summaryChars,
    historyRefPath: report.historyRefPath,
    trigger: "manual",
    status,
    removedCount: report.removedCount,
    reductionRatio: report.beforeCount > 0 ? report.removedCount / report.beforeCount : undefined,
    reason: report.reason,
  };
}

function createCompactionSummary(payload: ContextCompactionPayload): string {
  if (payload.status === "skipped") return "Nothing to compact";
  if (payload.status === "failed") return "Context compaction failed";
  return `Context compacted · ${payload.removedCount ?? 0} messages removed`;
}
