import { toolPreview } from "./tool-card.js";
import { foldSubagentList, subagentListChildrenWithoutModel } from "./subagent-list.js";
import {
  type BackgroundNotice,
  createMessageBlocks,
  contextEstimateState,
  contextEstimateUsage,
  type ContextEstimateView,
  type SessionEvent,
  type SessionRecord,
  normalizeModelKey,
  readFileReferenceBlocks,
  readResponseExcerptBlocks,
  type UsageActivityRow,
  type UsageActivityStatus,
  type UsageActivityTokens,
  CNY_PER_USD,
  hasVisibleText,
} from "@actspace/shared";
import { foldSubagentTree, lastActivationModel, surfaceNode, type SessionSurfaceNodeV1, type RuntimeV2JsonValue, type RuntimeV2SessionSnapshot, type RuntimeV2ToolView, type SubagentView } from "@actspace/shared/runtime-v2";
import type { LiveOutputBaseline, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { inheritedThroughSeq } from "@actspace/shared/session-list-page";

type EventRecord = Readonly<Record<string, RuntimeV2JsonValue>>;

export function projectChatWindow(projection: import("@actspace/shared/runtime-v2").RuntimeV2DesktopSessionProjection, workspaceRoot = ""): SessionRecord {
  const record = projectChatSession(projection.snapshot, projection.window.events, workspaceRoot);
  const deferred = new Set(projection.deferredToolCalls);
  for (const block of record.messageBlocks ?? []) {
    const event = record.events.find(event => event.id === block.id);
    const callId = event?.type === "tool_result" ? (event.payload as { toolCallId?: string }).toolCallId : undefined;
    if (callId && deferred.has(callId)) block.deferredToolDetail = { sessionId: projection.sessionId, callId };
  }
  const view = projection.values.contextEstimate as unknown as ContextEstimateView | undefined;
  return view ? { ...record, contextState: contextEstimateState(view, projection.sessionId), contextSnapshot: contextEstimateUsage(view, projection.snapshot) } : record;
}
type RequestInfo = { readonly requestId: string; readonly agentRunId: string; readonly turnId: string; readonly stepId: string; readonly model: string; readonly provider: string; readonly time: string };
type EventIndex = {
  readonly runByTurn: Map<string, string>;
  readonly turnByStep: Map<string, string>;
  readonly runByInboxMessage: Map<string, string>;
  readonly turnByInboxMessage: Map<string, string>;
  readonly requestById: Map<string, RequestInfo>;
  /** 每个 step 最后一次请求（重试后的那次）；step/end 不带 requestId，靠它找回模型。 */
  readonly lastRequestByStep: Map<string, string>;
  readonly toolByCall: Map<string, RuntimeV2ToolView>;
  readonly callData: Map<string, EventRecord>;
  /** Child of an `agent`/`explore` call: `subagent/*` facts for new Sessions, `delegation/*` for old ones. */
  readonly childByCall: Map<string, ChildFacts>;
  /** Description of each subagent of this Session, for `send_message` / `interrupt_agent` rows. */
  readonly describeAgent: (agentId: string) => string | undefined;
  /** Background task status by the tool call that started it, from `background/task` facts. */
  readonly backgroundByCall: Map<string, { readonly status: string }>;
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
      agentMode: snapshot.agentMode,
      agentModeRevision: snapshot.agentModeRevision,
      workspaceRoot: snapshot.workspaceRoot ?? fallbackWorkspaceRoot,
      ...(snapshot.worktree ? { worktree: snapshot.worktree } : {}),
      pinned: snapshot.metadata.pinned,
      archived: snapshot.metadata.archived,
    },
    events,
    messageBlocks: createMessageBlocks(events),
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
    // Old Sessions only: streamed text is shown by the settled message (or, mid-run, by the live baseline).
    if (event.type === "assistant/chunk") continue;
    const data = record(event.data);
    const identity = identityFor(event, data, index);
    const base = {
      sessionId: snapshot.sessionId,
      agentRunId: identity.agentRunId,
      ...(identity.turnId === null ? {} : { turnId: identity.turnId }),
      ...(identity.requestId === null ? {} : { llmCallId: identity.requestId }),
      timestamp: event.time,
      schemaVersion: 2 as const,
      // 同一条 envelope 投影出的多个事件（如 assistant 与它的 thinking）共用这个 seq。
      sourceSeq: event.seq,
    };
    if (event.type === "user/message" || (event.type === "agent/inbox/spliced" && string(data.operation) === "claim")) {
      const node = appendNode(event);
      if (node === null || !activeSurface.showsMessage(node.messageId, event.seq)) continue;
      projectSurfaceNode(projected, node, { ...base, id: eventId(event) }, index, string(data.source) ?? undefined, backgroundNotice(data.notice, data.opensTurn === true));
      continue;
    }
    if (event.type === "assistant/message") {
      const node = appendNode(event);
      if (node === null || !activeSurface.showsMessage(node.messageId, event.seq)) continue;
      projectSurfaceNode(projected, node, { ...base, id: eventId(event) }, index);
      continue;
    }
    if (event.type === "tool/call") {
      const callId = string(data.callId) ?? `call-${event.seq}`;
      const tool = index.toolByCall.get(callId);
      if (tool?.state !== "running" && !activeSurface.showsToolCall(callId)) continue;
      projected.push({ ...base, id: eventId(event), type: "tool_call", payload: { id: callId, name: string(data.name) ?? "tool", arguments: record(data.args) } });
      if (tool?.state === "running") {
        projected.push({ ...base, id: `${eventId(event)}-running`, type: "tool_result", payload: {
          toolCallId: callId, toolName: tool.name, status: "running",
          uiPreview: toolPreview(tool.name, tool, {}, data, index.childByCall.get(callId), snapshot.sessionId, identity.agentRunId, "running", snapshot.workspaceRoot ?? undefined, undefined, undefined, index.describeAgent),
        } });
      }
      continue;
    }
    if (isToolTerminal(event.type)) {
      const callId = string(data.callId) ?? `call-${event.seq}`;
      if (!activeSurface.showsToolCall(callId)) continue;
      const tool = index.toolByCall.get(callId);
      const toolName = tool?.name ?? string(index.callData.get(callId)?.name) ?? "tool";
      const ok = event.type === "tool/result" && string(data.status) === "completed";
      const preview = toolPreview(toolName, tool, data, index.callData.get(callId), index.childByCall.get(callId), snapshot.sessionId, identity.agentRunId, "finished", snapshot.workspaceRoot ?? undefined, undefined, index.backgroundByCall.get(callId), index.describeAgent);
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
    // 每次请求的用量记一次：成功的落在 step/end（assistant/message 带的是同一份，上面已 continue），
    // 失败重试的落在 llm/retry；辅助尝试只消费独立终结事实，不生成聊天消息。
    const auxiliary = event.type === "llm/auxiliary-end";
    if (event.type === "step/end" || event.type === "llm/retry" || auxiliary) {
      const usage = record(data.usage);
      if (Object.keys(usage).length === 0) continue;
      // 轮尾只累加已报告的 Token；全未知和未终结尝试仍由 activity/轨迹展示未知。
      if (auxiliary && activityTokens(usage).totalTokens === null) continue;
      const stepId = string(data.stepId);
      const requestId = (auxiliary ? string(data.attemptId) : string(data.requestId) ?? (stepId ? index.lastRequestByStep.get(stepId) : undefined)) ?? `request-${event.seq}`;
      const request = index.requestById.get(requestId);
      const promptTokens = nonNegative(usage.inputTokens);
      const completionTokens = nonNegative(usage.outputTokens);
      const cacheHitTokens = nonNegative(usage.cacheReadTokens);
      const cacheMissTokens = nonNegative(usage.cacheWriteTokens);
      const reasoningTokens = nonNegative(usage.reasoningTokens);
      const cost = activityCost(usage);
      // request/context 里的 route 常是 "default"；计价快照里有真实的提供方和模型。
      const pricing = cost.costProvenance?.pricingSnapshot;
      const provider = pricing?.providerId ?? (auxiliary ? string(data.routeId) : request?.provider) ?? "default";
      const model = pricing?.apiModel ?? (auxiliary ? string(data.model) : request?.model) ?? "default";
      projected.push({ ...base, id: eventId(event), llmCallId: requestId, type: "llm_usage", payload: { llmCallId: requestId, attempt: auxiliary ? finiteInteger(data.attempt) ?? 1 : 1, durationMs: 0, provider, model, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens + cacheHitTokens + cacheMissTokens, reasoningTokens, cacheHitTokens, cacheMissTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost.costUsd ?? 0, currency: "USD" }, costBasis: cost.costBasis === "unavailable" ? "unavailable" : cost.costBasis === "estimated" ? "estimated" : "priced" } });
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
    if (event.type === "turn/end" && string(data.reason) === "step-limit") {
      // turn/end 不带上限；步数打满时本轮 step/start 的数量就是上限。窗口截断导致数不出来时不写数字。
      const turnId = string(data.turnId);
      const steps = journal.filter(candidate => candidate.type === "step/start" && string(record(candidate.data).turnId) === turnId).length;
      const limit = steps > 0 ? ` ${steps} 步` : "步数";
      projected.push({ ...base, id: eventId(event), type: "agent_run_notice", payload: { message: `本轮达到${limit}上限，已停止。发送「继续」可以接着做。` } });
      continue;
    }
    if (event.type === "compaction/end") {
      const compactionId = string(data.compactionId);
      const started = findCompactionStart(journal, compactionId);
      const start = nonNegative(started?.data.start);
      const end = nonNegative(started?.data.end);
      const durationMs = typeof data.durationMs === "number" && Number.isFinite(data.durationMs) && data.durationMs >= 0
        ? data.durationMs
        : started === undefined ? undefined : Date.parse(event.time) - Date.parse(started.time);
      const summary = compactionSummaryText(journal, compactionId);
      const trigger = data.trigger === "manual" || data.trigger === "auto" ? data.trigger : undefined;
      // 旧 journal 没有压缩前后 token，这里不再拿会话当前用量充数。
      const beforeTokens = nullableNonNegative(data.beforeTokens);
      const afterTokens = beforeTokens === null ? null : nullableNonNegative(data.afterTokens);
      projected.push({ ...base, id: eventId(event), type: "context_compaction", payload: {
        triggerTokens: beforeTokens ?? 0, thresholdTokens: 0, beforeCount: end, afterCount: Math.max(1, start + 1),
        summaryChars: summary?.length ?? 0, historyRefPath: "journal.jsonl", status: "compacted", removedCount: Math.max(0, end - start),
        ...(durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0 ? { durationMs } : {}),
        ...(summary ? { summary } : {}),
        ...(compactionId ? { compactionId } : {}),
        ...(trigger ? { trigger } : {}),
        ...(beforeTokens === null ? {} : { beforeTokens }),
        ...(afterTokens === null ? {} : { afterTokens }),
        ...(beforeTokens !== null && data.beforeEstimated === true ? { beforeEstimated: true as const } : {}),
      } });
    }
  }
  return projected;
}

type SurfaceProjectionBase = Omit<SessionEvent, "type" | "payload"> & { readonly id: string };

function projectSurfaceNode(
  projected: SessionEvent[],
  node: SessionSurfaceNodeV1,
  base: SurfaceProjectionBase,
  index: EventIndex,
  source?: string,
  notice?: BackgroundNotice,
): void {
  if (node.kind === "user") {
    const fileReferences = readFileReferenceBlocks(node.content);
    const responseAnnotations = readResponseExcerptBlocks(node.content);
    projected.push({ ...base, type: "user_message", payload: {
      content: contentText(node.content),
      attachments: attachmentViews(node.content),
      ...(fileReferences.length === 0 ? {} : { fileReferences }),
      ...(responseAnnotations.length === 0 ? {} : { responseAnnotations }),
      ...(source === undefined ? {} : { source }),
      ...(notice === undefined ? {} : { backgroundNotice: notice }),
    } });
    return;
  }
  if (node.kind !== "assistant") return;
  const request = base.llmCallId === undefined ? undefined : index.requestById.get(base.llmCallId);
  const reasoning = contentBlocks(node.content)
    .filter((block) => block.type === "reasoning" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  if (hasVisibleText(reasoning)) projected.push({ ...base, id: `${base.id}-thinking`, type: "thinking", payload: { title: "Thinking", content: reasoning, collapsedByDefault: true, model: request?.model, provider: request?.provider } });
  projected.push({ ...base, type: "assistant_message", payload: { content: contentText(node.content, false), stopReason: "stop", model: request?.model ?? "default", provider: request?.provider ?? "default" } });
}

/**
 * The model only sees the effective Surface, but the chat keeps showing messages a compaction replaced:
 * they stay readable above the compaction divider, and the summary is shown inside that divider instead.
 */
function indexActiveSurface(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]) {
  const messageIds = new Set(snapshot.messages.map((message) => message.messageId));
  const toolCallIds = new Set(snapshot.messages.flatMap((message) => message.kind === "tool-result" && message.callId ? [message.callId] : []));
  const compactedSeqs = new Set(journal.flatMap((event) => event.surface?.kind === "replace" ? event.surface.sourceEventSeqs : []));
  const compactedCallIds = new Set(journal.flatMap((event) => compactedSeqs.has(event.seq) && isToolTerminal(event.type) ? [string(record(event.data).callId) ?? ""] : []).filter(Boolean));
  return {
    showsMessage: (messageId: string, seq: number) => messageIds.has(messageId) || compactedSeqs.has(seq),
    showsToolCall: (callId: string) => toolCallIds.has(callId) || compactedCallIds.has(callId),
  };
}

function compactionSummaryText(events: readonly SessionEventEnvelopeV1[], compactionId: string | null): string | undefined {
  if (!compactionId) return undefined;
  const replacement = events.find((event) => event.surface?.kind === "replace" && string(record(event.data).compactionId) === compactionId);
  if (replacement?.surface?.kind !== "replace") return undefined;
  const content = surfaceNode(replacement)?.content;
  if (content === undefined) return undefined;
  const text = isRecord(content) && typeof content.text === "string" ? content.text : contentText(content, false);
  return text.trim() || undefined;
}


/**
 * The subagent panel's transcript: the child's Journal projection plus, while it runs, the child's live
 * baseline (text not yet settled into a message; agent-spec-live-assistant-stream §6).
 */
export function projectSubagentTranscript(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[], pending?: LiveOutputBaseline): SessionEvent[] {
  // A forked subagent's Journal starts with the parent's events; the panel shows only what it did after the fork.
  const inherited = inheritedThroughSeq(snapshot.lineage);
  const events = projectChatEvents(snapshot, journal)
    .filter(event => event.sourceSeq === undefined || event.sourceSeq > inherited);
  const settled = new Set(journal.filter(event => event.type === "assistant/message").map(event => string(record(event.data).messageId)));
  const now = new Date().toISOString();
  for (const segment of pending?.segments ?? []) {
    if (!segment.text || settled.has(segment.messageId)) continue;
    events.push({ id: `live-${segment.kind}:${segment.messageId}`, sessionId: snapshot.sessionId, agentRunId: pending?.runId ?? "subagent-live", timestamp: now,
      type: segment.kind === "thinking" ? "thinking" : "assistant_message",
      payload: segment.kind === "thinking" ? { title: "Thinking", content: segment.text, collapsedByDefault: false } : { content: segment.text } } as SessionEvent);
  }
  const index = buildIndex(snapshot, journal);
  for (const tool of snapshot.tools.filter((tool) => tool.state === "running")) {
    if (events.some(event => event.type === "tool_result" && (event.payload as { toolCallId?: string }).toolCallId === tool.callId)) continue;
    const call = index.callData.get(tool.callId);
    events.push({ id: `live-tool:${tool.callId}`, sessionId: snapshot.sessionId, agentRunId: "subagent-live", timestamp: tool.startedAt ?? new Date(0).toISOString(), type: "tool_result",
      payload: { toolCallId: tool.callId, status: "running", uiPreview: toolPreview(tool.name, tool, {}, call, index.childByCall.get(tool.callId), snapshot.sessionId, "subagent-live", "running", snapshot.workspaceRoot ?? undefined) } } as SessionEvent);
  }
  return events;
}

/** 整份折叠版的 `subagentListChildrenWithoutModel`（见 subagent-list.ts）；面板轮询用按会话常驻的增量状态。 */
export function subagentChildrenWithoutModel(journal: readonly SessionEventEnvelopeV1[]): { readonly childSessionId: string; readonly finished: boolean }[] {
  return subagentListChildrenWithoutModel(foldSubagentList(journal));
}

/** The model of the latest request a Session actually sent (`request/header`); not the purpose binding. */
export function latestRequestModel(journal: readonly SessionEventEnvelopeV1[]): string | undefined {
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    const event = journal[index]!;
    if (event.type !== "request/header") continue;
    const model = string(record(event.data).model);
    if (model) return model;
  }
  return undefined;
}

type UsageSession = Pick<RuntimeV2SessionSnapshot, "sessionId" | "throughJournalSeq" | "workspaceRoot" | "metadata">;

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

export function projectSessionUsageActivities(snapshot: UsageSession, journal: readonly SessionEventEnvelopeV1[]): UsageActivityRow[] {
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
  const auxiliary = new Map<string, { start: SessionEventEnvelopeV1; end?: SessionEventEnvelopeV1 }>();

  for (const event of journal) {
    const data = record(event.data);
    if (event.type === "llm/auxiliary-start") {
      const attemptId = string(data.attemptId);
      if (attemptId) auxiliary.set(attemptId, { start: event });
      continue;
    }
    if (event.type === "llm/auxiliary-end") {
      const attemptId = string(data.attemptId);
      const attempt = attemptId ? auxiliary.get(attemptId) : undefined;
      if (attempt) attempt.end = event;
      continue;
    }
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
  const previousAttempts = new Map<string, string>();
  for (const { start, end } of auxiliary.values()) {
    const row = activityRowForAuxiliary(snapshot, start, end);
    const previous = previousAttempts.get(row.logicalRequestId!);
    if (previous) row.retryOfRequestId = previous;
    previousAttempts.set(row.logicalRequestId!, row.requestId!);
    rows.push(row);
  }
  for (const row of rows) row.sessionTitle = snapshot.metadata.title ?? undefined;
  activityRowsCache.set(journal, { revision: snapshot.throughJournalSeq, sessionId: snapshot.sessionId, rows });
  return rows;
}

function activityRowForAuxiliary(snapshot: UsageSession, start: SessionEventEnvelopeV1, end: SessionEventEnvelopeV1 | undefined): UsageActivityRow {
  const data = record(start.data);
  const terminal = record(end?.data);
  const usage = record(terminal.usage);
  const cost = activityCost(usage);
  const pricing = cost.costProvenance?.pricingSnapshot;
  const providerId = pricing?.providerId ?? string(data.routeId) ?? undefined;
  const model = pricing?.apiModel ?? string(data.model) ?? undefined;
  const startedAt = string(data.startedAt) ?? start.time;
  const endedAt = end ? string(terminal.finishedAt) ?? end.time : undefined;
  return {
    activityId: `${snapshot.sessionId}:auxiliary:${data.attemptId}`,
    kind: "llm_request", sessionId: snapshot.sessionId,
    agentRunId: string(data.agentRunId) ?? "system",
    turnId: string(data.turnId) ?? undefined, stepId: string(data.stepId) ?? undefined,
    requestId: string(data.attemptId) ?? undefined, callId: string(data.callId) ?? undefined,
    logicalRequestId: string(data.logicalRequestId) ?? undefined, purpose: data.purpose as UsageActivityRow["purpose"],
    routeId: string(data.routeId) ?? undefined, providerId, model,
    modelKey: modelKeyFor(providerId, model),
    ...(pricing?.connectionId ? { connectionId: pricing.connectionId } : {}),
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    startedAt, ...(endedAt ? { endedAt, durationMs: duration(startedAt, endedAt) } : {}),
    attempt: finiteInteger(data.attempt) ?? undefined,
    tokens: activityTokens(usage), ...cost,
    status: end ? requestActivityStatus(string(terminal.status)) : "running",
    sourceEventSeq: start.seq, relatedEventSeqs: [start.seq, ...(end ? [end.seq] : [])],
  };
}

function activityRowForRequest(snapshot: UsageSession, state: ActivityRequestState): UsageActivityRow {
  const terminal = state.assistant && Object.keys(record(record(state.assistant.data).usage)).length ? state.assistant : state.stepEnd ?? state.assistant;
  const terminalData = terminal ? record(terminal.data) : {};
  const usage = record(terminalData.usage ?? record(state.retry?.data).usage);
  const retryData = state.retry ? record(state.retry.data) : {};
  const reason = string(terminalData.finishReason) ?? string(terminalData.reason);
  const status = terminal ? requestActivityStatus(reason) : state.retry ? "error" : "running";
  const cost = activityCost(usage);
  const relatedEventSeqs = [state.header.seq, state.context?.seq, state.retry?.seq, state.retryStarted?.seq, state.assistant?.seq, state.stepEnd?.seq].filter((seq): seq is number => typeof seq === "number");
  const endedAt = terminal?.time ?? state.retry?.time;
  // 首字时间只在新日志里有；老会话缺失时两段都不记（页面算「没有首字记录」）。
  const firstTokenAt = string(record(state.assistant?.data).firstTokenAt);
  const ttftMs = firstTokenAt ? nonNegativeSpan(state.header.time, firstTokenAt) : undefined;
  const decodeMs = firstTokenAt && endedAt && ttftMs !== undefined ? nonNegativeSpan(firstTokenAt, endedAt) : undefined;
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
    ...(ttftMs === undefined ? {} : { ttftMs }),
    ...(decodeMs === undefined ? {} : { decodeMs }),
    ...(state.attempt === undefined ? {} : { attempt: state.attempt }),
    tokens: activityTokens(usage),
    ...cost,
    ...(cost.costProvenance?.pricingSnapshot ? { providerId: cost.costProvenance.pricingSnapshot.providerId, model: cost.costProvenance.pricingSnapshot.apiModel, ...(cost.costProvenance.pricingSnapshot.connectionId ? { connectionId: cost.costProvenance.pricingSnapshot.connectionId } : {}) } : {}),
    status,
    sourceEventSeq: state.header.seq,
    relatedEventSeqs: [...new Set(relatedEventSeqs)].sort((left, right) => left - right),
  };
}

function nonNegativeSpan(from: string, to: string): number | undefined {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
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

function buildIndex(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): EventIndex {
  const runByTurn = new Map<string, string>(); const turnByStep = new Map<string, string>(); const runByInboxMessage = new Map<string, string>(); const turnByInboxMessage = new Map<string, string>(); const requestById = new Map<string, RequestInfo>(); const lastRequestByStep = new Map<string, string>(); const callData = new Map<string, EventRecord>(); const childByCall = new Map<string, ChildFacts>(); const backgroundByCall = new Map<string, { status: string }>(); const callByTask = new Map<string, string>();
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
      if (requestId && turnId && stepId) {
        requestById.set(requestId, { requestId, agentRunId: runByTurn.get(turnId) ?? runId ?? "system", turnId, stepId, model: string(prepared.model) ?? "default", provider: string(prepared.route) ?? "default", time: event.time });
        lastRequestByStep.set(stepId, requestId);
      }
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
    if (event.type === "background/task") {
      const taskId = string(data.taskId);
      if (data.op === "start" && taskId && callId) { callByTask.set(taskId, callId); backgroundByCall.set(callId, { status: "running" }); }
      const owner = taskId ? callByTask.get(taskId) : undefined;
      if (data.op === "settle" && owner) backgroundByCall.set(owner, { status: string(data.status) ?? "lost" });
    }
    if (event.type === "delegation/completed") {
      const invocationId = string(data.invocationId); const completed = invocationId ? journal.find((candidate) => candidate.type === "delegation/requested" && string(record(candidate.data).invocationId) === invocationId) : undefined;
      const parentCallId = completed ? string(record(completed.data).parentCallId) : null;
      if (parentCallId) { const model = string(data.model); childByCall.set(parentCallId, { childSessionId: string(data.childSessionId) ?? "", presetId: string(data.presetId) ?? childByCall.get(parentCallId)?.presetId ?? "unknown", status: string(data.status) ?? "completed", ...(model ? { model } : {}) }); }
    }
  }
  const tree = foldSubagentTree(journal);
  for (const view of Object.values(tree.agents)) {
    if (view.legacy) continue;
    const model = lastActivationModel(view);
    childByCall.set(view.callId, { childSessionId: view.agentId, presetId: `actspace.subagent.${view.preset ?? view.kind}`, status: subagentCardStatus(view), ...(model ? { model } : {}), subagent: view });
  }
  return { runByTurn, turnByStep, runByInboxMessage, turnByInboxMessage, requestById, lastRequestByStep, toolByCall: new Map(snapshot.tools.map((tool) => [tool.callId, tool])), callData, childByCall, backgroundByCall, describeAgent: (agentId) => tree.agents[agentId]?.description };
}

type ChildFacts = { readonly childSessionId: string; readonly presetId: string; readonly status: string; readonly model?: string; readonly subagent?: SubagentView };

/** The card status of a subagent: running, or how its latest activation ended. */
function subagentCardStatus(view: SubagentView): string {
  if (view.status === "running") return "running";
  const settled = view.activations.at(-1)?.settle?.status;
  // Lost (the app exited) is an interruption the user can continue, not a failure.
  return settled === "completed" ? "completed" : settled === "interrupted" || settled === "lost" ? "aborted" : "failed";
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

function backgroundNotice(value: RuntimeV2JsonValue | undefined, opensTurn: boolean): BackgroundNotice | undefined {
  const notice = record(value); const taskId = string(notice.taskId); const kind = notice.kind;
  return taskId && (kind === "bash" || kind === "agent" || kind === "subagent" || kind === "agent_message") ? { taskId, taskKind: kind, title: string(notice.title) ?? taskId, status: string(notice.status) ?? "completed", opensTurn } : undefined;
}
function appendNode(event: SessionEventEnvelopeV1) { return event.surface?.kind === "append" ? surfaceNode(event) : null; }
function contentBlocks(value: RuntimeV2JsonValue): readonly EventRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function contentText(value: RuntimeV2JsonValue, includeReasoning = true): string { if (typeof value === "string") return value; if (!Array.isArray(value)) return JSON.stringify(value ?? null, null, 2); return value.flatMap((entry) => { if (typeof entry === "string") return [entry]; if (!isRecord(entry)) return [JSON.stringify(entry)]; if (entry.type === "text" && typeof entry.text === "string") return [entry.text]; if (includeReasoning && entry.type === "reasoning" && typeof entry.text === "string") return [entry.text]; if (entry.type === "image") return [typeof entry.alt === "string" ? `[${entry.alt}]` : "[image]"]; if (entry.type === "artifact") return [typeof entry.label === "string" ? `[${entry.label}]` : "[attachment]"]; return []; }).join(""); }
function attachmentViews(value: RuntimeV2JsonValue | undefined) { return contentBlocks(value ?? []).filter((entry) => entry.type === "artifact").map((entry, index) => { const artifactId = string(record(entry.artifact).artifactId) ?? `attachment-${index}`; return { id: artifactId, path: artifactId, kind: (string(record(entry.artifact).mediaType)?.startsWith("image/") ? "image" : "file") as "image" | "file", name: string(entry.label) ?? `Attachment ${index + 1}`, mimeType: string(record(entry.artifact).mediaType) ?? undefined }; }); }
function modelOutputText(value: RuntimeV2JsonValue | undefined): string { if (!Array.isArray(value)) return ""; return value.map((entry) => { const block = record(entry); return typeof block.text === "string" ? block.text : block.value === undefined ? "" : JSON.stringify(block.value); }).filter(Boolean).join("\n"); }
function toolModelOutputText(tool: RuntimeV2ToolView | undefined): string { return tool?.modelOutput?.map((block) => block.type === "text" ? block.text : `${block.alt} (${block.artifactId})`).join("\n") ?? ""; }
function findCompactionStart(events: readonly SessionEventEnvelopeV1[], id: string | null) { if (!id) return undefined; const event = events.find((candidate) => candidate.type === "compaction/start" && string(record(candidate.data).compactionId) === id); return event === undefined ? undefined : { data: record(event.data), time: event.time }; }
function isToolTerminal(type: string): boolean { return type === "tool/result" || type === "tool/recovery-outcome"; }
function eventId(event: SessionEventEnvelopeV1): string { return `v2-${event.seq}`; }
function record(value: RuntimeV2JsonValue | undefined): EventRecord { return isRecord(value) ? value : {}; }
function isRecord(value: RuntimeV2JsonValue | undefined): value is EventRecord { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function nonNegative(value: RuntimeV2JsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }
function nullableNonNegative(value: RuntimeV2JsonValue | undefined): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null; }
function finiteInteger(value: RuntimeV2JsonValue | undefined): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null; }
function duration(start: string, end?: string): number { if (!end) return 0; const value = Date.parse(end) - Date.parse(start); return Number.isFinite(value) && value > 0 ? value : 0; }
