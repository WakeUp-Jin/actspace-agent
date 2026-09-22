import type { SessionEvent, SessionRecord } from "@actspace/shared";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2JsonValue, RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";

export function projectionFixture(sessionId = "s", throughJournalSeq = -1, events: readonly SessionEventEnvelopeV1[] = []): RuntimeV2DesktopSessionProjection {
  const snapshot: RuntimeV2SessionSnapshot = { kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z", throughJournalSeq, workspaceRoot: "/tmp/workspace", accessState: "read-write", metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], lineage: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null } };
  return { kind: "session-projection", schemaVersion: 1, sessionId, throughJournalSeq, snapshot, activeMessageIds: [], deferredToolCalls: [],
    values: { metadata: snapshot.metadata, providerUsage: snapshot.usage, sessionStats: snapshot.activity, requestContext: { sessionId, throughJournalSeq, updatedAt: snapshot.updatedAt, basis: "last-request", estimator: { name: "runtime-v2-request-snapshot", version: "2" }, totalEstimatedTokens: 0, maxTokens: 0, percentUsed: 0, entries: [], buckets: [] } },
    window: { events, fromSeq: events[0]?.seq ?? 0, throughJournalSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 } };
}

/** Converts older UI test scenarios to Journal fixtures, never used in production. */
export function recordProjectionFixture(record: SessionRecord): RuntimeV2DesktopSessionProjection {
  const sourceEvents = record.events.length > 0 ? record.events : (record.messageBlocks ?? []).flatMap((block) => {
    if (block.kind !== "user" && block.kind !== "assistant") return [];
    return [{ id: block.id, sessionId: record.meta.id, agentRunId: "fixture-run", schemaVersion: 2 as const, timestamp: block.createdAt, type: block.kind === "user" ? "user_message" as const : "assistant_message" as const, payload: { content: block.content } }];
  });
  const events: SessionEventEnvelopeV1[] = sourceEvents.map((event, seq) => legacyEventToJournal(event, seq));
  const value = projectionFixture(record.meta.id, events.length - 1, events);
  return { ...value, activeMessageIds: events.flatMap(event => event.surface ? [event.surface.node.messageId] : []), snapshot: { ...value.snapshot, metadata: { title: record.meta.title, pinned: record.meta.pinned ?? false, archived: record.meta.archived ?? false }, workspaceRoot: record.meta.workspaceRoot, messages: events.flatMap(event => event.surface ? [event.surface.node] : []), activity: { ...value.snapshot.activity, turnCount: record.meta.agentRunCount, completedTurnCount: record.meta.agentRunCount } } };
}

function legacyEventToJournal(event: SessionEvent, seq: number): SessionEventEnvelopeV1 {
  const payload = record(event.payload);
  const identity = { agentRunId: event.agentRunId, ...(event.turnId ? { turnId: event.turnId } : {}), ...(event.llmCallId ? { requestId: event.llmCallId } : {}) };
  let type: string = "turn/end";
  let data: Record<string, RuntimeV2JsonValue> = { ...identity, reason: "completed" };
  let surface: SessionEventEnvelopeV1["surface"] = null;
  if (event.type === "user_message") {
    type = "user/message";
    data = { ...identity, messageId: event.id, content: payload.content ?? "" };
    surface = { kind: "append", node: { kind: "user", messageId: event.id, content: payload.content ?? "" } };
  } else if (event.type === "assistant_message" || event.type === "assistant_reply") {
    type = "assistant/message";
    data = { ...identity, messageId: event.id, content: payload.content ?? "", ...(payload.usage === undefined ? {} : { usage: payload.usage }), ...(payload.stopReason === undefined ? {} : { finishReason: payload.stopReason }) };
    surface = { kind: "append", node: { kind: "assistant", messageId: event.id, content: payload.content ?? "" } };
  } else if (event.type === "tool_call") {
    type = "tool/call";
    data = { ...identity, callId: payload.id ?? payload.toolCallId ?? event.id, name: payload.name ?? payload.toolName ?? "tool", args: payload.arguments ?? payload.args ?? {} , pluginId: "fixture" };
  } else if (event.type === "tool_result") {
    type = "tool/result";
    surface = { kind: "append", node: { kind: "tool-result", messageId: event.id, callId: String(payload.toolCallId ?? event.id), content: payload.modelOutput ?? "", isError: payload.ok === false || payload.status === "failed" } };
    data = { ...identity, callId: payload.toolCallId ?? payload.callId ?? event.id, name: payload.toolName ?? "tool", status: payload.status ?? (payload.ok === false ? "failed" : "completed"), summary: payload.summary ?? "Tool completed", ...(payload.detail === undefined ? {} : { detail: payload.detail }), ...(payload.modelOutput === undefined ? {} : { modelOutput: payload.modelOutput }), ...(payload.uiPreview === undefined ? {} : { renderer: payload.uiPreview }) };
  } else if (event.type === "thinking") {
    type = "assistant/chunk";
    data = { ...identity, messageId: event.id, chunkIndex: 0, kind: "reasoning", content: payload.content ?? "" };
  } else if (event.type === "llm_usage") {
    type = "assistant/message";
    data = { ...identity, messageId: event.id, content: "", usage: event.payload as unknown as RuntimeV2JsonValue };
  } else if (event.type === "error") {
    type = "agent/error";
    data = { ...identity, failure: event.payload as unknown as RuntimeV2JsonValue };
  } else if (event.type === "agent_run_aborted") {
    type = "turn/end";
    data = { ...identity, reason: "aborted" };
  }
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "ignorable", time: event.timestamp, source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

function record(value: unknown): Record<string, RuntimeV2JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, RuntimeV2JsonValue> : {};
}
