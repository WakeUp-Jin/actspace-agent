import type { RuntimeV2DelegationView, RuntimeV2JsonValue, RuntimeV2SessionActivity, RuntimeV2SessionMessage, RuntimeV2SessionMetadata, RuntimeV2SessionSnapshot, RuntimeV2TodoItem, RuntimeV2ToolRendererHint, RuntimeV2ToolView, RuntimeV2UsageSummary } from "@actspace/shared/runtime-v2";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { effectiveSessionEvents } from "@actspace/session-journal";
import { SessionJournal } from "@actspace/session-journal";
import type { SessionHeaderV1 } from "@actspace/session-journal";
import { resolveSessionWorkspaceRoot } from "@actspace/session-jsonl";
import { createRunningToolView, completeToolView, projectRendererHint, type RendererAllowlist, type ToolProjectionIdentity } from "./tool-dto.js";
import { redactProjectionText } from "./redaction.js";

export type DurableProjectionOptions = {
  readonly header: SessionHeaderV1;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly registry: EventCodecRegistry;
  readonly rendererAllowlist?: RendererAllowlist;
};

export function projectSessionSnapshot(options: DurableProjectionOptions): RuntimeV2SessionSnapshot {
  const journal = new SessionJournal({ registry: options.registry, seed: options.events });
  const knownEvents = effectiveSessionEvents(options.events).filter((event) => options.registry.resolve(event).kind === "known");
  const tools = projectTools(options.header.sessionId, knownEvents, options.rendererAllowlist);
  const messages = Object.freeze(journal.surface.entries.map((entry): RuntimeV2SessionMessage => Object.freeze({
    kind: entry.node.kind,
    messageId: entry.node.messageId,
    content: entry.node.content,
    ...(entry.node.kind === "tool-result" ? { callId: entry.node.callId } : {}),
  })));
  const pendingInboxView = Object.freeze(pendingInbox(options.events, options.registry).map((item) => Object.freeze(item)));
  const product = projectProductFacts(knownEvents);
  return Object.freeze({
    kind: "session-snapshot",
    schemaVersion: 1,
    sessionId: options.header.sessionId,
    createdAt: options.header.createdAt,
    updatedAt: options.events.at(-1)?.time ?? options.header.createdAt,
    workspaceRoot: resolveSessionWorkspaceRoot(options.header, knownEvents) || null,
    throughJournalSeq: options.events.at(-1)?.seq ?? -1,
    accessState: journal.validation.accessState,
    metadata: product.metadata,
    messages,
    tools: Object.freeze(tools),
    pendingInbox: pendingInboxView,
    todos: product.todos,
    delegations: product.delegations,
    usage: product.usage,
    activity: product.activity,
    lineage: options.header.lineage as RuntimeV2JsonValue | null,
  });
}

function projectProductFacts(events: readonly SessionEventEnvelopeV1[]): {
  readonly metadata: RuntimeV2SessionMetadata;
  readonly todos: readonly RuntimeV2TodoItem[];
  readonly delegations: readonly RuntimeV2DelegationView[];
  readonly usage: RuntimeV2UsageSummary;
  readonly activity: RuntimeV2SessionActivity;
} {
  const usageEvents = selectUsageEventSeqs(events);
  let title: string | null = null; let pinned = false; let archived = false;
  const todos = new Map<string, RuntimeV2TodoItem>();
  const delegations = new Map<string, RuntimeV2DelegationView>();
  let inputTokens = 0; let outputTokens = 0; let cacheReadTokens = 0; let cacheWriteTokens = 0; let totalCost = 0; let hasUsdCost = false;
  let turnCount = 0; let completedTurnCount = 0; let stepCount = 0; let activeTurnId: string | null = null; let activeStepId: string | null = null;
  let compactionCount = 0; let activeCompactionId: string | null = null; let lastCompactionSummary: string | null = null;
  for (const event of events) {
    if (!isRecord(event.data)) continue;
    const data = event.data;
    if (event.type === "session/title-set") title = typeof data.title === "string" ? redactProjectionText(data.title, 160) : null;
    if (event.type === "session/pinned-set" && typeof data.pinned === "boolean") pinned = data.pinned;
    if (event.type === "session/archived-set" && typeof data.archived === "boolean") archived = data.archived;
    if (event.type.startsWith("todo/")) projectTodo(todos, event.type, data);
    if (event.type === "delegation/requested" || event.type === "delegation/completed") projectDelegation(delegations, event.type, data);
    if (usageEvents.has(event.seq) && isRecord(data.usage)) {
      inputTokens += nonNegativeNumber(data.usage.inputTokens);
      outputTokens += nonNegativeNumber(data.usage.outputTokens);
      cacheReadTokens += nonNegativeNumber(data.usage.cacheReadTokens);
      cacheWriteTokens += nonNegativeNumber(data.usage.cacheWriteTokens);
      if ((data.usage.costCurrency === "USD" || data.usage.costCurrency === "usd") && typeof data.usage.cost === "number" && Number.isFinite(data.usage.cost) && (data.usage.cost > 0 || (isRecord(data.usage.costProvenance) && data.usage.costProvenance.version === 1 && (data.usage.costProvenance.basis === "estimated" || data.usage.costProvenance.basis === "provider-reported")))) { totalCost += Math.max(0, data.usage.cost); hasUsdCost = true; }
    }
    if (event.type === "turn/start") { turnCount += 1; activeTurnId = stringValue(data.turnId); }
    if (event.type === "turn/end") { completedTurnCount += 1; if (activeTurnId === stringValue(data.turnId)) activeTurnId = null; }
    if (event.type === "step/start") { stepCount += 1; activeStepId = stringValue(data.stepId); }
    if (event.type === "step/end" && activeStepId === stringValue(data.stepId)) activeStepId = null;
    if (event.type === "compaction/start") activeCompactionId = stringValue(data.compactionId);
    if (event.type === "compaction/summary") lastCompactionSummary = stringValue(data.summary) ?? stringValue(data.content);
    if (event.type === "compaction/end") { compactionCount += 1; if (activeCompactionId === stringValue(data.compactionId)) activeCompactionId = null; }
  }
  return Object.freeze({
    metadata: Object.freeze({ title, pinned, archived }),
    todos: Object.freeze([...todos.values()].sort((left, right) => left.todoId.localeCompare(right.todoId))),
    delegations: Object.freeze([...delegations.values()]),
    usage: Object.freeze({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens, costUsd: hasUsdCost ? totalCost : null }),
    activity: Object.freeze({ turnCount, completedTurnCount, stepCount, activeTurnId, activeStepId, compactionCount, activeCompactionId, lastCompactionSummary }),
  });
}

function projectTodo(items: Map<string, RuntimeV2TodoItem>, type: string, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  const todoId = stringValue(data.todoId); const revision = data.revision; if (todoId === null || typeof revision !== "number" || !Number.isSafeInteger(revision)) return;
  const previous = items.get(todoId); const text = typeof data.text === "string" ? redactProjectionText(data.text, 500) : previous?.text ?? "";
  const explicitState = data.state === "pending" || data.state === "in_progress" || data.state === "completed" || data.state === "cancelled" ? data.state : undefined;
  const state = explicitState ?? previous?.state ?? "pending";
  const activeForm = typeof data.activeForm === "string" ? redactProjectionText(data.activeForm, 500) : previous?.activeForm;
  const createdAt = typeof data.createdAt === "string" ? data.createdAt : previous?.createdAt;
  const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : previous?.updatedAt;
  items.set(todoId, Object.freeze({ todoId, revision, text, state, ...(activeForm === undefined ? {} : { activeForm }), ...(createdAt === undefined ? {} : { createdAt }), ...(updatedAt === undefined ? {} : { updatedAt }) }));
}

function projectDelegation(items: Map<string, RuntimeV2DelegationView>, type: string, data: Readonly<Record<string, RuntimeV2JsonValue>>): void {
  const invocationId = stringValue(data.invocationId); if (invocationId === null) return; const previous = items.get(invocationId);
  const presetKind = data.presetId === "actspace.agent" ? "agent" : data.presetId === "actspace.explore" ? "explore" : undefined;
  const kind = data.agentKind === "agent" || data.agentKind === "explore" ? data.agentKind : presetKind ?? previous?.agentKind ?? "unknown";
  items.set(invocationId, Object.freeze({ invocationId, childSessionId: stringValue(data.childSessionId) ?? previous?.childSessionId ?? null, agentKind: kind, state: type === "delegation/completed" ? "completed" : "requested", summary: stringValue(data.summary) ?? previous?.summary ?? null }));
}

function nonNegativeNumber(value: RuntimeV2JsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }

function projectTools(sessionId: string, events: readonly SessionEventEnvelopeV1[], rendererAllowlist: RendererAllowlist | undefined): RuntimeV2ToolView[] {
  const byCall = new Map<string, RuntimeV2ToolView>();
  for (const event of events) {
    if (!isRecord(event.data)) continue;
    const callId = stringValue(event.data.callId);
    if (callId === null) continue;
    if (event.type === "tool/call") {
      const identity: ToolProjectionIdentity = {
        sessionId,
        agentRunId: stringValue(event.data.agentRunId) ?? "unknown",
        turnId: stringValue(event.data.turnId) ?? "unknown",
        stepId: stringValue(event.data.stepId) ?? "unknown",
        pluginId: stringValue(event.data.pluginId) ?? event.source.ownerPluginId,
        name: stringValue(event.data.name) ?? "unknown",
        callId,
      };
      byCall.set(callId, createRunningToolView(identity, event, event.data.args ?? {}, projectRendererHint(event.data.renderer, rendererAllowlist)));
      continue;
    }
    const previous = byCall.get(callId);
    if (previous === undefined) continue;
    if (event.type === "tool-workflow/run-start" || event.type === "tool-workflow/agent-start" || event.type === "tool/code-dispatch-start") {
      byCall.set(callId, Object.freeze({ ...previous, phase: "executing" }));
      continue;
    }
    if (["tool/result", "tool/recovery-outcome"].includes(event.type)) {
      byCall.set(callId, completeFromEvent(previous, event, rendererAllowlist));
    }
  }
  return [...byCall.values()].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.callId.localeCompare(right.callId));
}

function completeFromEvent(previous: RuntimeV2ToolView, event: SessionEventEnvelopeV1, rendererAllowlist: RendererAllowlist | undefined): RuntimeV2ToolView {
  const data = isRecord(event.data) ? event.data : {};
  const rawStatus = stringValue(data.status);
  const status = rawStatus === "denied" || rawStatus === "aborted" || rawStatus === "outcome-unknown" || rawStatus === "completed"
    ? rawStatus
    : event.type === "tool/result" ? "completed" : "outcome-unknown";
  const result = {
    status,
    callId: previous.callId,
    pluginId: previous.pluginId,
    name: previous.name,
    registrationId: "journal",
    definitionVersion: 1,
    definitionDigest: "journal",
    summary: stringValue(data.summary) ?? (status === "completed" ? "Tool completed." : `Tool ${status}.`),
    modelOutput: Array.isArray(data.modelOutput) ? data.modelOutput : [],
    detail: Array.isArray(data.detail) ? data.detail : [],
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    failure: isRecord(data.failure) ? {
      code: stringValue(data.failure.code) ?? "TOOL_FAILURE",
      message: stringValue(data.failure.message) ?? "Tool failed.",
      retryable: data.failure.retryable === true,
      phase: "body" as const,
    } : status === "outcome-unknown" ? { code: "TOOL_OUTCOME_UNKNOWN", message: "Tool outcome is unknown.", retryable: false, phase: "body" as const } : undefined,
    finalizerFailures: [],
    dispatched: true,
  } as const;
  return completeToolView(previous, result, event.time, projectRendererHint(data.renderer, rendererAllowlist));
}

function isRecord(value: RuntimeV2JsonValue | undefined): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: RuntimeV2JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? redactProjectionText(value, 240) : null;
}

// Keep the pending Inbox fold local to the projection boundary so the Journal API remains domain-focused.
function pendingInbox(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): readonly { messageId: string; target: "next-step" | "next-turn" }[] {
  const pending = new Map<string, "next-step" | "next-turn">();
  for (const event of effectiveSessionEvents(events)) {
    if (registry.resolve(event).kind !== "known" || !isRecord(event.data)) continue;
    const messageId = stringValue(event.data.messageId);
    const target = event.data.target === "next-step" || event.data.target === "next-turn" ? event.data.target : null;
    if (messageId === null || target === null) continue;
    if (event.type === "agent/inbox/spliced") {
      const operation = event.data.operation;
      if (operation === "enqueue") pending.set(messageId, target);
      if (operation === "claim" || operation === "discard") pending.delete(messageId);
    }
  }
  return [...pending].map(([messageId, target]) => ({ messageId, target }));
}

/** Terminal copies describe one request; retries have their own request identity. */
function selectUsageEventSeqs(events: readonly SessionEventEnvelopeV1[]): Set<number> {
  const requestByStep = new Map<string, string>();
  const selected = new Map<string, { seq: number; assistant: boolean }>();
  let activeStep: string | null = null;
  for (const event of events) {
    if (!isRecord(event.data)) continue;
    const data = event.data;
    if (event.type === "step/start") activeStep = stringValue(data.stepId);
    const step = stringValue(data.stepId) ?? activeStep;
    if (event.type === "request/header" && step && typeof data.requestId === "string") requestByStep.set(step, data.requestId);
    if (!["assistant/message", "step/end", "llm/retry"].includes(event.type) || !isRecord(data.usage) || !Object.keys(data.usage).length) continue;
    const key = stringValue(data.requestId) ?? (step ? requestByStep.get(step) ?? `step:${step}` : `event:${event.seq}`);
    const previous = selected.get(key);
    const assistant = event.type === "assistant/message";
    if (!previous || assistant || !previous.assistant) selected.set(key, { seq: event.seq, assistant });
  }
  return new Set([...selected.values()].map((value) => value.seq));
}
