import { toolPreview } from "./tool-card.js";
import {
  createMessageBlocks,
  type ContextUsageSnapshot,
  projectContextState,
  type MessageBlock,
  type SessionEvent,
  type SessionRecord,
  normalizeModelKey,
  type UsageActivityRow,
  type UsageActivityStatus,
  type UsageActivityTokens,
  CNY_PER_USD,
} from "@actspace/shared";
import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot, RuntimeV2ToolView } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";

type EventRecord = Readonly<Record<string, RuntimeV2JsonValue>>;

export function projectChatWindow(projection: import("@actspace/shared/runtime-v2").RuntimeV2DesktopSessionProjection, workspaceRoot = ""): SessionRecord {
  const record = projectChatSession(projection.snapshot, projection.window.events, workspaceRoot);
  const deferred = new Set(projection.deferredToolCalls);
  for (const block of record.messageBlocks ?? []) {
    const event = record.events.find(event => event.id === block.id);
    const callId = event?.type === "tool_result" ? (event.payload as { toolCallId?: string }).toolCallId : undefined;
    if (callId && deferred.has(callId)) block.deferredToolDetail = { sessionId: projection.sessionId, callId };
  }
  const state = projection.values.requestContext as unknown as import("@actspace/shared").ContextState;
  return { ...record, contextState: state, contextSnapshot: {
    throughJournalSeq: projection.throughJournalSeq, basis: state.basis, requestId: state.requestId,
    totalTokens: state.totalEstimatedTokens, maxTokens: state.maxTokens, percentUsed: state.percentUsed,
    compressionCount: projection.snapshot.activity.compactionCount,
    cumulativeTokens: projection.snapshot.usage.totalTokens, cumulativeUsage: projection.snapshot.usage,
    estimator: state.estimator, buckets: state.buckets,
  } };
}
type RequestInfo = { readonly requestId: string; readonly agentRunId: string; readonly turnId: string; readonly stepId: string; readonly model: string; readonly provider: string; readonly time: string };
type EventIndex = {
  readonly runByTurn: Map<string, string>;
  readonly turnByStep: Map<string, string>;
  readonly runByInboxMessage: Map<string, string>;
  readonly turnByInboxMessage: Map<string, string>;
  readonly requestById: Map<string, RequestInfo>;
  readonly toolByCall: Map<string, RuntimeV2ToolView>;
  readonly callData: Map<string, EventRecord>;
  readonly childByCall: Map<string, { readonly childSessionId: string; readonly presetId: string; readonly status: string }>;
};

export function projectChatSession(
  snapshot: RuntimeV2SessionSnapshot,
  journal: readonly SessionEventEnvelopeV1[],
  fallbackWorkspaceRoot: string,
): SessionRecord {
  const events = projectChatEvents(snapshot, journal);
  return {
    meta: {
      schemaVersion: 2,
      id: snapshot.sessionId,
      title: snapshot.metadata.title ?? "New chat",
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      agentRunCount: snapshot.activity.completedTurnCount,
      agentForm: snapshot.agentForm,
      workspaceRoot: snapshot.workspaceRoot ?? fallbackWorkspaceRoot,
      pinned: snapshot.metadata.pinned,
      archived: snapshot.metadata.archived,
    },
    events,
    messageBlocks: createMessageBlocks(events),
    contextSnapshot: projectContextSnapshot(snapshot, journal),
    contextState: projectContextState(snapshot, journal),
  };
}

export function projectChatEvents(
  snapshot: RuntimeV2SessionSnapshot,
  journal: readonly SessionEventEnvelopeV1[],
): SessionEvent[] {
  const index = buildIndex(snapshot, journal);
  const activeSurface = indexActiveSurface(snapshot, journal);
  const projected: SessionEvent[] = [];
  for (const event of journal) {
    const data = record(event.data);
    const identity = identityFor(event, data, index);
    const base = {
      sessionId: snapshot.sessionId,
      agentRunId: identity.agentRunId,
      ...(identity.turnId === null ? {} : { turnId: identity.turnId }),
      ...(identity.requestId === null ? {} : { llmCallId: identity.requestId }),
      timestamp: event.time,
      schemaVersion: 2 as const,
    };
    for (const replacement of activeSurface.replacementsAt.get(event.seq) ?? []) {
      projectSurfaceNode(projected, replacement.surface!.node, {
        ...base,
        id: eventId(replacement),
        timestamp: replacement.time,
      }, index);
    }
    if (event.type === "user/message" || (event.type === "agent/inbox/spliced" && string(data.operation) === "claim")) {
      const node = appendNode(event);
      if (node === null || !activeSurface.messageIds.has(node.messageId)) continue;
      projectSurfaceNode(projected, node, { ...base, id: eventId(event) }, index, string(data.source) ?? undefined);
      continue;
    }
    if (event.type === "assistant/message") {
      const node = appendNode(event);
      if (node === null || !activeSurface.messageIds.has(node.messageId)) continue;
      projectSurfaceNode(projected, node, { ...base, id: eventId(event) }, index);
      continue;
    }
    if (event.type === "tool/call") {
      const callId = string(data.callId) ?? `call-${event.seq}`;
      const tool = index.toolByCall.get(callId);
      if (tool?.state !== "running" && !activeSurface.toolCallIds.has(callId)) continue;
      projected.push({ ...base, id: eventId(event), type: "tool_call", payload: { id: callId, name: string(data.name) ?? "tool", arguments: record(data.args) } });
      continue;
    }
    if (isToolTerminal(event.type)) {
      const callId = string(data.callId) ?? `call-${event.seq}`;
      if (!activeSurface.toolCallIds.has(callId)) continue;
      const tool = index.toolByCall.get(callId);
      const toolName = tool?.name ?? string(index.callData.get(callId)?.name) ?? "tool";
      const ok = event.type === "tool/result" && string(data.status) === "completed";
      const preview = toolPreview(toolName, tool, data, index.callData.get(callId), index.childByCall.get(callId), snapshot.sessionId, identity.agentRunId, "finished", snapshot.workspaceRoot ?? undefined);
      projected.push({
        ...base,
        id: eventId(event),
        type: "tool_result",
        payload: {
          toolCallId: callId,
          toolName,
          ok,
          status: string(data.status) ?? tool?.state,
          summary: string(data.summary) ?? tool?.summary ?? (ok ? "Tool completed" : "Tool failed"),
          modelOutput: modelOutputText(data.modelOutput) || toolModelOutputText(tool),
          uiPreview: preview,
          artifacts: tool?.artifacts.map((artifact) => ({ type: artifact.kind === "image" ? "image" : artifact.kind === "diff" ? "diff" : "file", name: artifact.label, path: artifact.artifactId, mimeType: artifact.mimeType })) ?? [],
          ...(tool?.failure === null || tool?.failure === undefined ? {} : { error: { code: tool.failure.code, message: tool.failure.message, recoverable: tool.failure.retryable } }),
          startedAt: tool?.startedAt,
          endedAt: tool?.finishedAt ?? event.time,
          durationMs: tool?.durationMs ?? undefined,
        },
      });
      continue;
    }
    if (event.type === "surface/replaced") continue;
    if (event.type === "assistant/message" || event.type === "step/end") {
      const requestId = string(data.requestId) ?? identity.requestId ?? `request-${event.seq}`;
      const usage = record(data.usage);
      const request = index.requestById.get(requestId);
      const promptTokens = nonNegative(usage.inputTokens);
      const completionTokens = nonNegative(usage.outputTokens);
      const cacheHitTokens = nonNegative(usage.cacheReadTokens);
      const cacheMissTokens = nonNegative(usage.cacheWriteTokens);
      const reasoningTokens = nonNegative(usage.reasoningTokens);
      const currency = "USD" as const;
      const rawCurrency = string(usage.costCurrency)?.toUpperCase();
      const rawCost = nonNegative(usage.cost);
      const totalCost = rawCurrency === "CNY" ? rawCost / CNY_PER_USD : rawCost;
      projected.push({ ...base, id: eventId(event), llmCallId: requestId, type: "llm_usage", payload: { llmCallId: requestId, attempt: 1, durationMs: 0, provider: request?.provider ?? "default", model: request?.model ?? "default", promptTokens, completionTokens, totalTokens: promptTokens + completionTokens + cacheHitTokens + cacheMissTokens, reasoningTokens, cacheHitTokens, cacheMissTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: totalCost, currency } } });
      continue;
    }
    if (event.type === "agent/error" || (event.type === "turn/end" && string(data.reason) === "failed")) {
      const failure = record(data.failure);
      projected.push({ ...base, id: eventId(event), type: "error", payload: { code: string(failure.kind) ?? "LLM_ERROR", message: string(failure.message) ?? "LLM request failed.", recoverable: failure.retryable === true } });
      continue;
    }
    if (event.type === "turn/end" && string(data.reason) === "aborted") {
      projected.push({ ...base, id: eventId(event), type: "agent_run_aborted", payload: { reason: "user" } });
      continue;
    }
    if (event.type === "compaction/end") {
      const started = findCompactionStart(journal, string(data.compactionId));
      const start = nonNegative(started?.data.start);
      const end = nonNegative(started?.data.end);
      projected.push({ ...base, id: eventId(event), type: "context_compaction", payload: { triggerTokens: snapshot.usage.totalTokens, thresholdTokens: snapshot.usage.totalTokens, beforeCount: end, afterCount: Math.max(1, start + 1), summaryChars: 0, historyRefPath: "journal.jsonl", trigger: "manual", status: "compacted", removedCount: Math.max(0, end - start - 1) } });
    }
  }
  return projected;
}

type SurfaceProjectionBase = Omit<SessionEvent, "type" | "payload"> & { readonly id: string };

function projectSurfaceNode(
  projected: SessionEvent[],
  node: NonNullable<SessionEventEnvelopeV1["surface"]>["node"],
  base: SurfaceProjectionBase,
  index: EventIndex,
  source?: string,
): void {
  if (node.kind === "user") {
    projected.push({ ...base, type: "user_message", payload: { content: contentText(node.content), attachments: attachmentViews(node.content), ...(source === undefined ? {} : { source }) } });
    return;
  }
  if (node.kind !== "assistant") return;
  const request = base.llmCallId === undefined ? undefined : index.requestById.get(base.llmCallId);
  const reasoning = contentBlocks(node.content)
    .filter((block) => block.type === "reasoning" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  if (reasoning.trim()) projected.push({ ...base, id: `${base.id}-thinking`, type: "thinking", payload: { title: "Thinking", content: reasoning, collapsedByDefault: true, model: request?.model, provider: request?.provider } });
  projected.push({ ...base, type: "assistant_message", payload: { content: contentText(node.content, false), stopReason: "stop", model: request?.model ?? "default", provider: request?.provider ?? "default" } });
}

function indexActiveSurface(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]) {
  const messageIds = new Set(snapshot.messages.map((message) => message.messageId));
  const toolCallIds = new Set(snapshot.messages.flatMap((message) => message.kind === "tool-result" && message.callId ? [message.callId] : []));
  const replacementsAt = new Map<number, SessionEventEnvelopeV1[]>();
  for (const event of journal) {
    const surface = event.surface;
    if (surface?.kind !== "replace" || !messageIds.has(surface.node.messageId)) continue;
    const origin = surface.sourceEventSeqs[0] ?? event.seq;
    const insertionSeq = journal.some(item => item.seq === origin) ? origin : event.seq;
    replacementsAt.set(insertionSeq, [...(replacementsAt.get(insertionSeq) ?? []), event]);
  }
  return { messageIds, toolCallIds, replacementsAt };
}

export function projectContextSnapshot(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[] = []): ContextUsageSnapshot {
  const state = projectContextState(snapshot, journal);
  return {
    throughJournalSeq: state.throughJournalSeq,
    basis: state.basis,
    requestId: state.requestId,
    totalTokens: state.totalEstimatedTokens,
    maxTokens: state.maxTokens,
    percentUsed: state.percentUsed,
    compressionCount: snapshot.activity.compactionCount,
    cumulativeTokens: snapshot.usage.totalTokens,
    cumulativeUsage: snapshot.usage,
    estimator: state.estimator,
    buckets: state.buckets,
  };
}

export { projectContextState } from "@actspace/shared";

export function projectSubagentTranscript(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): SessionEvent[] {
  const events = projectChatEvents(snapshot, journal);
  const index = buildIndex(snapshot, journal);
  const completedMessages = new Set(journal.filter((event) => event.type === "assistant/message").map((event) => string(record(event.data).messageId)));
  const chunks = new Map<string, SessionEvent>();
  for (const event of journal) {
    const data = record(event.data);
    if (event.type !== "assistant/chunk" || completedMessages.has(string(data.messageId))) continue;
    if (data.kind !== "assistant-delta" && data.kind !== "reasoning-delta") continue;
    const key = `${string(data.messageId)}:${string(data.kind)}`;
    const previous = chunks.get(key);
    const identity = identityFor(event, data, index);
    chunks.set(key, { id: previous?.id ?? eventId(event), sessionId: snapshot.sessionId, agentRunId: identity.agentRunId, timestamp: event.time,
      type: data.kind === "reasoning-delta" ? "thinking" : "assistant_message",
      payload: { content: String((previous?.payload as { content?: string } | undefined)?.content ?? "") + String(data.content ?? "") } } as SessionEvent);
  }
  events.push(...chunks.values());
  for (const tool of snapshot.tools.filter((tool) => tool.state === "running")) {
    const call = index.callData.get(tool.callId);
    events.push({ id: `live-tool:${tool.callId}`, sessionId: snapshot.sessionId, agentRunId: "subagent-live", timestamp: tool.startedAt ?? new Date(0).toISOString(), type: "tool_result",
      payload: { toolCallId: tool.callId, status: "running", uiPreview: toolPreview(tool.name, tool, {}, call, index.childByCall.get(tool.callId), snapshot.sessionId, "subagent-live", "running", snapshot.workspaceRoot ?? undefined) } } as SessionEvent);
  }
  return events;
}

export function projectSubagentList(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): MessageBlock[] {
  const index = buildIndex(snapshot, journal);
  return journal.filter((event) => event.type === "tool/call" && ["agent", "explore"].includes(String(record(event.data).name))).flatMap((event) => {
    const call = record(event.data);
    const callId = String(call.callId);
    const tool = index.toolByCall.get(callId);
    const child = index.childByCall.get(callId);
    const terminalEvent = journal.find((candidate) => isToolTerminal(candidate.type) && record(candidate.data).callId === callId);
    const identity = identityFor(event, call, index);
    const preview = toolPreview(String(call.name), tool, terminalEvent ? record(terminalEvent.data) : {}, call, child, snapshot.sessionId, identity.agentRunId, terminalEvent ? "finished" : "running", snapshot.workspaceRoot ?? undefined);
    if (preview.kind === "agent" && !terminalEvent) preview.stats = { durationMs: Math.max(0, Date.now() - Date.parse(event.time)), toolCallCount: 0 };
    return createMessageBlocks([{ id: `subagent:${callId}`, sessionId: snapshot.sessionId, agentRunId: identity.agentRunId, timestamp: event.time, type: "tool_result", payload: { toolCallId: callId, uiPreview: preview, status: terminalEvent ? tool?.state : "running" } } as SessionEvent]);
  });
}

type ActivityRequestState = {
  requestId: string;
  agentRunId: string;
  turnId: string;
  stepId: string;
  providerId?: string;
  model?: string;
  modelKey?: UsageActivityRow["modelKey"];
  attempt?: number;
  header: SessionEventEnvelopeV1;
  context?: SessionEventEnvelopeV1;
  assistant?: SessionEventEnvelopeV1;
  stepEnd?: SessionEventEnvelopeV1;
  retry?: SessionEventEnvelopeV1;
  retryStarted?: SessionEventEnvelopeV1;
  retryOfRequestId?: string;
};

const activityRowsCache = new WeakMap<readonly SessionEventEnvelopeV1[], { revision: number; sessionId: string; rows: UsageActivityRow[] }>();

export function projectSessionUsageActivities(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): UsageActivityRow[] {
  const cached = activityRowsCache.get(journal);
  if (cached?.revision === snapshot.throughJournalSeq && cached.sessionId === snapshot.sessionId) return cached.rows;
  const runByTurn = new Map<string, string>();
  for (const event of journal) {
    const data = record(event.data);
    const turnId = string(data.turnId);
    const runId = string(data.agentRunId);
    if (turnId && runId) runByTurn.set(turnId, runId);
  }

  const requests = new Map<string, ActivityRequestState>();
  const requestsByStep = new Map<string, ActivityRequestState[]>();
  const retries = new Map<string, SessionEventEnvelopeV1>();
  const retryStarted = new Map<string, SessionEventEnvelopeV1>();
  const tools = new Map<string, { call: SessionEventEnvelopeV1; terminal?: SessionEventEnvelopeV1 }>();

  for (const event of journal) {
    const data = record(event.data);
    if (event.type === "request/header") {
      const requestId = string(data.requestId);
      const turnId = string(data.turnId);
      const stepId = string(data.stepId);
      if (!requestId || !turnId || !stepId) continue;
      const state: ActivityRequestState = {
        requestId,
        agentRunId: runByTurn.get(turnId) ?? "system",
        turnId,
        stepId,
        providerId: string(data.routeId) ?? undefined,
        model: string(data.model) ?? undefined,
        attempt: finiteInteger(data.attempt) ?? undefined,
        header: event,
      };
      requests.set(requestId, state);
      const stepRequests = requestsByStep.get(stepId) ?? [];
      stepRequests.push(state);
      requestsByStep.set(stepId, stepRequests);
      continue;
    }
    if (event.type === "request/context") {
      const requestId = string(data.requestId);
      const state = requestId ? requests.get(requestId) : undefined;
      if (!state) continue;
      state.context = event;
      const contextSnapshot = record(data.snapshot);
      const prepared = record(contextSnapshot.prepared);
      state.providerId = string(prepared.route) ?? state.providerId;
      state.model = string(prepared.model) ?? state.model;
      state.modelKey = modelKeyFor(state.providerId, state.model);
      continue;
    }
    if (event.type === "assistant/message") {
      const requestId = string(data.requestId);
      const state = requestId ? requests.get(requestId) : undefined;
      if (state) state.assistant = event;
      continue;
    }
    if (event.type === "llm/retry") {
      const requestId = string(data.requestId);
      if (requestId) retries.set(requestId, event);
      continue;
    }
    if (event.type === "llm/retry-started") {
      const requestId = string(data.requestId);
      if (requestId) retryStarted.set(requestId, event);
      continue;
    }
    if (event.type === "step/end") {
      const stepId = string(data.stepId);
      if (!stepId) continue;
      const candidates = requestsByStep.get(stepId) ?? [];
      const candidate = [...candidates].reverse()[0];
      if (candidate && candidate.stepEnd === undefined) candidate.stepEnd = event;
      continue;
    }
    if (event.type === "tool/call") {
      const callId = string(data.callId) ?? string(data.toolCallId);
      if (callId) tools.set(callId, { call: event });
      continue;
    }
    if (event.type === "tool/result" || event.type === "tool/recovery-outcome") {
      const callId = string(data.callId) ?? string(data.toolCallId);
      const entry = callId ? tools.get(callId) : undefined;
      if (entry && entry.terminal === undefined) entry.terminal = event;
    }
  }

  for (const state of requests.values()) {
    state.retry = retries.get(state.requestId);
    state.retryStarted = retryStarted.get(state.requestId);
  }
  for (const state of requests.values()) {
    if (!state.retry) continue;
    const nextAttempt = finiteInteger(record(state.retry.data).nextAttempt);
    const successor = (requestsByStep.get(state.stepId) ?? []).find((candidate) => candidate.header.seq > state.retry!.seq && candidate.attempt === nextAttempt);
    if (successor) successor.retryOfRequestId = state.requestId;
  }

  const rows: UsageActivityRow[] = [];
  for (const state of requests.values()) rows.push(activityRowForRequest(snapshot, state));
  for (const { call, terminal } of tools.values()) rows.push(activityRowForTool(snapshot, call, terminal, runByTurn));
  for (const row of rows) row.sessionTitle = snapshot.metadata.title ?? undefined;
  activityRowsCache.set(journal, { revision: snapshot.throughJournalSeq, sessionId: snapshot.sessionId, rows });
  return rows;
}

function activityRowForRequest(snapshot: RuntimeV2SessionSnapshot, state: ActivityRequestState): UsageActivityRow {
  const terminal = state.assistant && Object.keys(record(record(state.assistant.data).usage)).length ? state.assistant : state.stepEnd ?? state.assistant;
  const terminalData = terminal ? record(terminal.data) : {};
  const usage = record(terminalData.usage ?? record(state.retry?.data).usage);
  const retryData = state.retry ? record(state.retry.data) : {};
  const reason = string(terminalData.finishReason) ?? string(terminalData.reason);
  const status = terminal ? requestActivityStatus(reason) : state.retry ? "error" : "running";
  const cost = activityCost(usage);
  const relatedEventSeqs = [state.header.seq, state.context?.seq, state.retry?.seq, state.retryStarted?.seq, state.assistant?.seq, state.stepEnd?.seq].filter((seq): seq is number => typeof seq === "number");
  const endedAt = terminal?.time ?? state.retry?.time;
  return {
    activityId: `${snapshot.sessionId}:request:${state.requestId}`,
    kind: "llm_request",
    sessionId: snapshot.sessionId,
    agentRunId: state.agentRunId,
    turnId: state.turnId,
    stepId: state.stepId,
    requestId: state.requestId,
    ...(state.retry?.data && string(retryData.retryId) ? { retryId: string(retryData.retryId)! } : {}),
    ...(state.retryOfRequestId ? { retryOfRequestId: state.retryOfRequestId } : {}),
    ...(state.providerId ? { providerId: state.providerId } : {}),
    ...(state.modelKey ? { modelKey: state.modelKey } : {}),
    ...(state.model ? { model: state.model } : {}),
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    startedAt: state.header.time,
    ...(endedAt ? { endedAt } : {}),
    ...(endedAt ? { durationMs: duration(state.header.time, endedAt) } : {}),
    ...(state.attempt === undefined ? {} : { attempt: state.attempt }),
    tokens: activityTokens(usage),
    ...cost,
    ...(cost.costProvenance?.pricingSnapshot ? { providerId: cost.costProvenance.pricingSnapshot.providerId, model: cost.costProvenance.pricingSnapshot.apiModel, ...(cost.costProvenance.pricingSnapshot.connectionId ? { connectionId: cost.costProvenance.pricingSnapshot.connectionId } : {}) } : {}),
    status,
    sourceEventSeq: state.header.seq,
    relatedEventSeqs: [...new Set(relatedEventSeqs)].sort((left, right) => left - right),
  };
}

function activityRowForTool(snapshot: RuntimeV2SessionSnapshot, call: SessionEventEnvelopeV1, terminal: SessionEventEnvelopeV1 | undefined, runByTurn: Map<string, string>): UsageActivityRow {
  const callData = record(call.data);
  const terminalData = terminal ? record(terminal.data) : {};
  const callId = string(callData.callId) ?? string(callData.toolCallId) ?? `call-${call.seq}`;
  const turnId = string(callData.turnId) ?? undefined;
  const status = terminal ? toolActivityStatus(string(terminalData.status)) : "running";
  const endedAt = terminal?.time;
  return {
    activityId: `${snapshot.sessionId}:tool:${callId}`,
    kind: "tool_invocation",
    sessionId: snapshot.sessionId,
    agentRunId: string(callData.agentRunId) ?? (turnId ? runByTurn.get(turnId) : undefined) ?? "system",
    ...(turnId ? { turnId } : {}),
    ...(string(callData.stepId) ? { stepId: string(callData.stepId)! } : {}),
    callId,
    ...(string(callData.name) ? { toolName: string(callData.name)! } : {}),
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    startedAt: call.time,
    ...(endedAt ? { endedAt } : {}),
    ...(endedAt ? { durationMs: duration(call.time, endedAt) } : {}),
    tokens: emptyActivityTokens(),
    costUsd: null,
    costBasis: "unavailable",
    status,
    sourceEventSeq: call.seq,
    relatedEventSeqs: [call.seq, ...(terminal ? [terminal.seq] : [])],
  };
}

function modelKeyFor(provider: string | undefined, model: string | undefined): UsageActivityRow["modelKey"] {
  if (!provider || !model) return undefined;
  return normalizeModelKey(`${provider}:${model}`);
}

function activityTokens(usage: EventRecord): UsageActivityTokens {
  const inputTokens = nullableNonNegative(usage.inputTokens);
  const outputTokens = nullableNonNegative(usage.outputTokens);
  const cacheReadTokens = nullableNonNegative(usage.cacheReadTokens);
  const cacheWriteTokens = nullableNonNegative(usage.cacheWriteTokens);
  const reasoningTokens = nullableNonNegative(usage.reasoningTokens);
  const known = [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens];
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens: known.every((value) => value === null) ? null : known.reduce<number>((sum, value) => sum + (value ?? 0), 0) };
}

function emptyActivityTokens(): UsageActivityTokens { return { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null }; }

function activityCost(usage: EventRecord): Pick<UsageActivityRow, "costUsd" | "costBasis" | "costAmount" | "costCurrency" | "costProvenance" | "historicalUnverified"> {
  const cost = nullableNonNegative(usage.cost);
  const currency = string(usage.costCurrency)?.toUpperCase();
  const raw = record(usage.costProvenance);
  const provenance = raw.version === 1 && ["provider-reported", "estimated", "unknown"].includes(String(raw.basis)) ? raw as unknown as NonNullable<UsageActivityRow["costProvenance"]> : undefined;
  const unknown = { costUsd: null, costAmount: null, costCurrency: null, costBasis: "unavailable" as const, ...(provenance ? { costProvenance: provenance } : {}) };
  if (cost === null || (currency !== "USD" && currency !== "CNY") || provenance?.basis === "unknown") return unknown;
  if (!provenance && cost === 0) return unknown;
  const usd = currency === "CNY" ? cost / CNY_PER_USD : cost;
  return { costUsd: usd, costAmount: usd, costCurrency: "USD", costBasis: provenance?.basis === "provider-reported" ? "priced" : "estimated", ...(provenance ? { costProvenance: provenance } : { historicalUnverified: true }) };
}

function requestActivityStatus(reason: string | null): UsageActivityStatus {
  if (reason === "aborted") return "aborted";
  if (reason === "failed" || reason === "error") return "error";
  if (reason === "completed" || reason === "stop" || reason === "tool-use" || reason === "tool-calls" || reason === "success") return "success";
  return "unknown";
}

function toolActivityStatus(status: string | null): UsageActivityStatus {
  if (status === "aborted" || status === "cancelled") return "aborted";
  if (status === "completed" || status === "success" || status === "ok") return "success";
  if (status === "failed" || status === "denied" || status === "error") return "error";
  return "unknown";
}

function buildIndex(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): EventIndex {
  const runByTurn = new Map<string, string>(); const turnByStep = new Map<string, string>(); const runByInboxMessage = new Map<string, string>(); const turnByInboxMessage = new Map<string, string>(); const requestById = new Map<string, RequestInfo>(); const callData = new Map<string, EventRecord>(); const childByCall = new Map<string, { childSessionId: string; presetId: string; status: string }>();
  const turnStarts = journal
    .filter((event) => event.type === "turn/start")
    .map((event) => {
      const data = record(event.data);
      const turnId = string(data.turnId);
      const runId = string(data.agentRunId);
      return turnId && runId ? { seq: event.seq, turnId, runId } : null;
    })
    .filter((value): value is { seq: number; turnId: string; runId: string } => value !== null);
  for (const event of journal) {
    const data = record(event.data); const turnId = string(data.turnId); const runId = string(data.agentRunId);
    if (turnId && runId) runByTurn.set(turnId, runId);
    const stepId = string(data.stepId); if (stepId && turnId) turnByStep.set(stepId, turnId);
    if (event.type === "request/context") {
      const requestId = string(data.requestId); const snapshotData = record(data.snapshot); const prepared = record(snapshotData.prepared);
      if (requestId && turnId && stepId) requestById.set(requestId, { requestId, agentRunId: runByTurn.get(turnId) ?? runId ?? "system", turnId, stepId, model: string(prepared.model) ?? "default", provider: string(prepared.route) ?? "default", time: event.time });
    }
    if (event.type === "agent/inbox/spliced" && data.operation === "claim") {
      const messageId = string(data.messageId);
      if (messageId) {
        const target = string(data.target);
        const previousTurn = [...turnStarts].reverse().find((candidate) => candidate.seq < event.seq);
        const nextTurn = turnStarts.find((candidate) => candidate.seq > event.seq);
        const owner = target === "next-step" ? previousTurn ?? nextTurn : nextTurn ?? previousTurn;
        if (owner) {
          runByInboxMessage.set(messageId, owner.runId);
          turnByInboxMessage.set(messageId, owner.turnId);
        }
      }
    }
    const callId = string(data.callId); if (event.type === "tool/call" && callId) callData.set(callId, data);
    if (event.type === "delegation/requested") {
      const parentCallId = string(data.parentCallId); const presetId = string(data.presetId);
      if (parentCallId) childByCall.set(parentCallId, { childSessionId: string(data.childSessionId) ?? "", presetId: presetId ?? "unknown", status: "running" });
    }
    if (event.type === "delegation/completed") {
      const invocationId = string(data.invocationId); const completed = invocationId ? journal.find((candidate) => candidate.type === "delegation/requested" && string(record(candidate.data).invocationId) === invocationId) : undefined;
      const parentCallId = completed ? string(record(completed.data).parentCallId) : null;
      if (parentCallId) childByCall.set(parentCallId, { childSessionId: string(data.childSessionId) ?? "", presetId: string(data.presetId) ?? childByCall.get(parentCallId)?.presetId ?? "unknown", status: string(data.status) ?? "completed" });
    }
  }
  return { runByTurn, turnByStep, runByInboxMessage, turnByInboxMessage, requestById, toolByCall: new Map(snapshot.tools.map((tool) => [tool.callId, tool])), callData, childByCall };
}

function identityFor(event: SessionEventEnvelopeV1, data: EventRecord, index: EventIndex) {
  const requestId = string(data.requestId);
  const request = requestId ? index.requestById.get(requestId) : undefined;
  const inboxMessageId = string(data.messageId);
  const callId = string(data.callId);
  const call = callId ? index.callData.get(callId) : undefined;
  const stepId = string(data.stepId) ?? string(call?.stepId) ?? request?.stepId ?? null;
  const turnId = string(data.turnId) ?? string(call?.turnId) ?? request?.turnId ?? (stepId ? index.turnByStep.get(stepId) ?? null : null) ?? (inboxMessageId ? index.turnByInboxMessage.get(inboxMessageId) ?? null : null);
  const agentRunId = string(data.agentRunId) ?? string(call?.agentRunId) ?? request?.agentRunId ?? (inboxMessageId ? index.runByInboxMessage.get(inboxMessageId) ?? null : null) ?? (turnId ? index.runByTurn.get(turnId) ?? "system" : event.source.agentId ?? "system");
  return { requestId, turnId, stepId, agentRunId };
}

function appendNode(event: SessionEventEnvelopeV1) { return event.surface?.kind === "append" ? event.surface.node : null; }
function contentBlocks(value: RuntimeV2JsonValue): readonly EventRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function array(value: RuntimeV2JsonValue | undefined): readonly RuntimeV2JsonValue[] { return Array.isArray(value) ? value : []; }
function contentText(value: RuntimeV2JsonValue, includeReasoning = true): string { if (typeof value === "string") return value; if (!Array.isArray(value)) return JSON.stringify(value ?? null, null, 2); return value.flatMap((entry) => { if (typeof entry === "string") return [entry]; if (!isRecord(entry)) return [JSON.stringify(entry)]; if (entry.type === "text" && typeof entry.text === "string") return [entry.text]; if (includeReasoning && entry.type === "reasoning" && typeof entry.text === "string") return [entry.text]; if (entry.type === "image") return [typeof entry.alt === "string" ? `[${entry.alt}]` : "[image]"]; if (entry.type === "artifact") return [typeof entry.label === "string" ? `[${entry.label}]` : "[attachment]"]; return []; }).join(""); }
function attachmentViews(value: RuntimeV2JsonValue | undefined) { return contentBlocks(value ?? []).filter((entry) => entry.type === "artifact").map((entry, index) => { const artifactId = string(record(entry.artifact).artifactId) ?? `attachment-${index}`; return { id: artifactId, path: artifactId, kind: (string(record(entry.artifact).mediaType)?.startsWith("image/") ? "image" : "file") as "image" | "file", name: string(entry.label) ?? `Attachment ${index + 1}`, mimeType: string(record(entry.artifact).mediaType) ?? undefined }; }); }
function modelOutputText(value: RuntimeV2JsonValue | undefined): string { if (!Array.isArray(value)) return ""; return value.map((entry) => { const block = record(entry); return typeof block.text === "string" ? block.text : block.value === undefined ? "" : JSON.stringify(block.value); }).filter(Boolean).join("\n"); }
function toolModelOutputText(tool: RuntimeV2ToolView | undefined): string { return tool?.modelOutput?.map((block) => block.type === "text" ? block.text : `${block.alt} (${block.artifactId})`).join("\n") ?? ""; }
function findCompactionStart(events: readonly SessionEventEnvelopeV1[], id: string | null) { if (!id) return undefined; const event = events.find((candidate) => candidate.type === "compaction/start" && string(record(candidate.data).compactionId) === id); return event === undefined ? undefined : { data: record(event.data) }; }
function isToolTerminal(type: string): boolean { return type === "tool/result" || type === "tool/recovery-outcome"; }
function eventId(event: SessionEventEnvelopeV1): string { return `v2-${event.seq}`; }
function record(value: RuntimeV2JsonValue | undefined): EventRecord { return isRecord(value) ? value : {}; }
function isRecord(value: RuntimeV2JsonValue | undefined): value is EventRecord { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function nonNegative(value: RuntimeV2JsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }
function nullableNonNegative(value: RuntimeV2JsonValue | undefined): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null; }
function finiteInteger(value: RuntimeV2JsonValue | undefined): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null; }
function duration(start: string, end?: string): number { if (!end) return 0; const value = Date.parse(end) - Date.parse(start); return Number.isFinite(value) && value > 0 ? value : 0; }
