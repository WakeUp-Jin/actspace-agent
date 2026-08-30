import {
  createMessageBlocks,
  type AgentAnalysisIndexResult,
  type AgentAnalysisRunSummary,
  type AgentTraceEvent,
  type AgentTraceReadResult,
  type AgentTraceSummary,
  type ContextUsageSnapshot,
  type ContextState,
  type ContextStateEntry,
  type MessageBlock,
  type SessionEvent,
  type SessionRecord,
  type ToolUiPreview,
  type UsageStatisticsDailyRow,
  type UsageStatisticsModelEntry,
  type UsageStatisticsRequestRow,
  type UsageStatisticsSnapshot,
} from "@actspace/shared";
import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot, RuntimeV2ToolView } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

type EventRecord = Readonly<Record<string, RuntimeV2JsonValue>>;
type RequestInfo = { readonly requestId: string; readonly agentRunId: string; readonly turnId: string; readonly stepId: string; readonly model: string; readonly provider: string; readonly time: string };
type EventIndex = {
  readonly runByTurn: Map<string, string>;
  readonly turnByStep: Map<string, string>;
  readonly requestById: Map<string, RequestInfo>;
  readonly toolByCall: Map<string, RuntimeV2ToolView>;
  readonly callData: Map<string, EventRecord>;
  readonly childByCall: Map<string, { readonly childSessionId: string; readonly presetId: string; readonly status: string }>;
};

export function projectFixedRendererSession(
  snapshot: RuntimeV2SessionSnapshot,
  journal: readonly SessionEventEnvelopeV1[],
  fallbackWorkspaceRoot: string,
): SessionRecord {
  const events = projectFixedRendererEvents(snapshot, journal);
  return {
    meta: {
      schemaVersion: 2,
      id: snapshot.sessionId,
      title: snapshot.metadata.title ?? "New chat",
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      agentRunCount: snapshot.activity.completedTurnCount,
      workspaceRoot: snapshot.workspaceRoot ?? fallbackWorkspaceRoot,
      pinned: snapshot.metadata.pinned,
      archived: snapshot.metadata.archived,
    },
    events,
    messageBlocks: createMessageBlocks(events),
    contextSnapshot: projectContextSnapshot(snapshot),
    contextState: projectContextState(snapshot, journal),
  };
}

export function projectFixedRendererEvents(
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
    if (event.type === "user/message") {
      const node = appendNode(event);
      if (node === null || !activeSurface.messageIds.has(node.messageId)) continue;
      projectSurfaceNode(projected, node, { ...base, id: eventId(event) }, index);
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
      const ok = event.type === "tool/result" && string(data.status) !== "failed";
      const preview = toolPreview(toolName, tool, data, index.callData.get(callId), index.childByCall.get(callId), snapshot.sessionId, identity.agentRunId);
      projected.push({
        ...base,
        id: eventId(event),
        type: "tool_result",
        payload: {
          toolCallId: callId,
          toolName,
          ok,
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
      const currency = string(usage.costCurrency)?.toUpperCase() === "CNY" ? "CNY" as const : "USD" as const;
      const totalCost = nonNegative(usage.cost);
      projected.push({ ...base, id: eventId(event), llmCallId: requestId, type: "llm_usage", payload: { llmCallId: requestId, attempt: 1, durationMs: 0, provider: request?.provider ?? "default", model: request?.model ?? "default", promptTokens, completionTokens, totalTokens: promptTokens + completionTokens + cacheHitTokens + cacheMissTokens, reasoningTokens, cacheHitTokens, cacheMissTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: totalCost, currency } } });
      continue;
    }
    if (event.type === "agent/error") {
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
): void {
  if (node.kind === "user") {
    projected.push({ ...base, type: "user_message", payload: { content: contentText(node.content), attachments: attachmentViews(node.content) } });
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
    const insertionSeq = surface.sourceEventSeqs[0] ?? event.seq;
    replacementsAt.set(insertionSeq, [...(replacementsAt.get(insertionSeq) ?? []), event]);
  }
  return { messageIds, toolCallIds, replacementsAt };
}

export function projectContextSnapshot(snapshot: RuntimeV2SessionSnapshot): ContextUsageSnapshot {
  const maxTokens = 200_000;
  return {
    totalTokens: snapshot.usage.totalTokens,
    maxTokens,
    percentUsed: Math.min(100, snapshot.usage.totalTokens / maxTokens * 100),
    compressionCount: snapshot.activity.compactionCount,
    estimator: { name: "runtime-v2-provider-usage", version: "1" },
    buckets: [
      { name: "conversation", label: "Conversation", tokens: snapshot.usage.inputTokens + snapshot.usage.outputTokens },
      { name: "tools", label: "Tool results", tokens: snapshot.usage.cacheReadTokens + snapshot.usage.cacheWriteTokens },
    ],
  };
}

export function projectContextState(
  snapshot: RuntimeV2SessionSnapshot,
  journal: readonly SessionEventEnvelopeV1[],
): ContextState {
  const latest = [...journal].reverse().find((event) => event.type === "request/context");
  const request = latest === undefined ? {} : record(record(latest.data).snapshot);
  const entries: ContextStateEntry[] = [];
  const push = (kind: ContextStateEntry["kind"], id: string, title: string, value: RuntimeV2JsonValue, pinned = false) => {
    const preview = contextPreview(value);
    if (!preview) return;
    entries.push({ id, kind, title, estimatedTokens: estimateTokens(preview), included: true, pinned, removable: false, preview });
  };

  for (const [index, section] of array(request.systemSections).entries()) {
    if (Array.isArray(section)) {
      for (const [skillIndex, skill] of section.entries()) {
        const value = record(skill);
        push("skills", `request-${latest?.seq ?? 0}-skill-${index}-${skillIndex}`, string(value.id) ?? `Skill ${skillIndex + 1}`, value.content ?? skill);
      }
      continue;
    }
    const value = record(section);
    if (typeof value.content === "string" && typeof value.title === "string") {
      push("rules", `request-${latest?.seq ?? 0}-rule-${index}`, value.title, value.content);
      continue;
    }
    push("systemPrompt", `request-${latest?.seq ?? 0}-system-${index}`, index === 0 ? "Core identity" : index === 1 ? "Runtime safety" : `System section ${index + 1}`, section, true);
  }

  for (const [index, tool] of array(request.tools).entries()) {
    const value = record(tool);
    push("toolDefinitions", `request-${latest?.seq ?? 0}-tool-${index}`, string(value.name) ?? `Tool ${index + 1}`, tool);
  }

  const facts = array(request.facts);
  if (facts.length > 0) push("systemPrompt", `request-${latest?.seq ?? 0}-facts`, "Runtime facts", facts, true);
  if (snapshot.activity.lastCompactionSummary) push("summarizedConversation", `session-${snapshot.sessionId}-summary`, "Summarized conversation", snapshot.activity.lastCompactionSummary);
  for (const [index, message] of array(request.messages).entries()) {
    const value = record(message);
    push("conversation", `request-${latest?.seq ?? 0}-message-${index}`, `${string(value.role) ?? "message"} ${index + 1}`, value.content ?? message);
  }

  const bucketOrder: Array<{ key: NonNullable<ContextState["buckets"][number]["name"]>; label: string; kind: ContextStateEntry["kind"] }> = [
    { key: "systemPrompt", label: "System prompt", kind: "systemPrompt" },
    { key: "tools", label: "Tools", kind: "toolDefinitions" },
    { key: "rules", label: "Rules", kind: "rules" },
    { key: "skills", label: "Skills", kind: "skills" },
    { key: "summarizedConversation", label: "Summarized conversation", kind: "summarizedConversation" },
    { key: "conversation", label: "Conversation", kind: "conversation" },
  ];
  const buckets = bucketOrder.map(({ key, label, kind }) => ({ name: key, key, label, tokens: entries.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.estimatedTokens, 0) }));
  const totalEstimatedTokens = entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  const maxTokens = 200_000;
  return {
    sessionId: snapshot.sessionId,
    updatedAt: latest?.time ?? snapshot.updatedAt,
    estimator: { name: "runtime-v2-request-snapshot", version: "1" },
    totalEstimatedTokens,
    maxTokens,
    percentUsed: Math.min(100, totalEstimatedTokens / maxTokens * 100),
    buckets,
    entries,
  };
}

export function projectSubagentTranscript(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): MessageBlock[] {
  return createMessageBlocks(projectFixedRendererEvents(snapshot, journal));
}

export function projectTraceList(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): AgentTraceSummary[] {
  const index = buildIndex(snapshot, journal);
  const runIds = [...new Set(journal.map((event) => identityFor(event, record(event.data), index).agentRunId).filter((id) => id !== "system"))];
  return runIds.map((runId) => summarizeRun(snapshot, journal, index, runId)).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function projectTrace(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[], agentRunId: string): AgentTraceReadResult {
  const index = buildIndex(snapshot, journal);
  const events = journal.flatMap((event): AgentTraceEvent[] => {
    const data = record(event.data);
    const identity = identityFor(event, data, index);
    if (identity.agentRunId !== agentRunId) return [];
    const base = { schemaVersion: 1 as const, timestamp: event.time, sessionId: snapshot.sessionId, agentRunId, ...(identity.turnId === null ? {} : { turnId: identity.turnId }), ...(identity.requestId === null ? {} : { llmCallId: identity.requestId }) };
    if (event.type === "turn/start") return [{ ...base, type: "turn_start", payload: data }];
    if (event.type === "turn/end") return [{ ...base, type: "turn_end", payload: data }];
    if (event.type === "request/context") return [{ ...base, type: "llm_request", payload: data.snapshot ?? null }];
    if (event.type === "assistant/message" || event.type === "agent/error") return [{ ...base, type: "llm_response", payload: data }];
    if (event.type === "llm/retry") return [{ ...base, type: "llm_retry", payload: data }];
    return [];
  });
  const summary = summarizeRun(snapshot, journal, index, agentRunId);
  return { trace: summary, events: [{ schemaVersion: 1, timestamp: summary.startedAt, sessionId: snapshot.sessionId, agentRunId, type: "agent_run_start", payload: {} }, ...events, { schemaVersion: 1, timestamp: summary.endedAt ?? summary.startedAt, sessionId: snapshot.sessionId, agentRunId, type: "agent_run_end", payload: { status: summary.status } }] };
}

export function projectAnalysis(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): AgentAnalysisIndexResult {
  const runs = projectTraceList(snapshot, journal).map((trace): AgentAnalysisRunSummary => ({ ...trace, userMessagePreview: userMessagePreview(snapshot, journal, trace.agentRunId) }));
  return { sessionId: snapshot.sessionId, title: snapshot.metadata.title ?? "New chat", totals: totalsFromRuns(runs), toolNames: [...new Set(runs.flatMap((run) => run.toolNames))].sort(), runs };
}

export function projectUsageStatistics(
  sessions: readonly { readonly snapshot: RuntimeV2SessionSnapshot; readonly journal: readonly SessionEventEnvelopeV1[] }[],
  input: { readonly scope: "session" | "global"; readonly sessionId?: string; readonly range: UsageStatisticsSnapshot["range"]; readonly page: number },
): UsageStatisticsSnapshot {
  const rows = sessions.flatMap(({ snapshot, journal }) => usageRows(snapshot, journal)).filter((row) => inRange(row.timestamp, input.range));
  const modelDistribution = modelRows(rows);
  const dailyRows = dailyUsageRows(rows, sessions);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const selected = sessions[0]?.snapshot;
  const tools = sessions.flatMap(({ snapshot }) => snapshot.tools);
  const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
  const promptTokens = rows.reduce((sum, row) => sum + row.promptTokens, 0);
  const completionTokens = rows.reduce((sum, row) => sum + row.completionTokens, 0);
  const cacheHitTokens = rows.reduce((sum, row) => sum + row.cacheHitTokens, 0);
  const cacheMissTokens = rows.reduce((sum, row) => sum + row.cacheMissTokens, 0);
  return {
    scope: input.scope,
    sessionId: input.scope === "session" ? input.sessionId ?? null : null,
    title: input.scope === "session" ? selected?.metadata.title ?? "New chat" : "全部数据",
    range: input.range,
    generatedAt: new Date().toISOString(),
    sourceCount: sessions.length,
    summary: { totalTokens, promptTokens, completionTokens, cacheHitTokens, cacheMissTokens, reasoningTokens: rows.reduce((sum, row) => sum + row.reasoningTokens, 0), toolCallCount: tools.length, conversationCount: new Set(rows.map((row) => `${row.sessionId}:${row.agentRunId}`)).size, costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0), cacheEfficiencyPercent: totalTokens === 0 ? 0 : cacheHitTokens / totalTokens * 100 },
    modelDistribution,
    toolDistribution: toolRows(tools),
    dailyRows,
    requestRows: rows.sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice((page - 1) * pageSize, page * pageSize),
    requestRowsPage: { page, pageSize, totalRows: rows.length, totalPages },
  };
}

function buildIndex(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): EventIndex {
  const runByTurn = new Map<string, string>(); const turnByStep = new Map<string, string>(); const requestById = new Map<string, RequestInfo>(); const callData = new Map<string, EventRecord>(); const childByCall = new Map<string, { childSessionId: string; presetId: string; status: string }>();
  for (const event of journal) {
    const data = record(event.data); const turnId = string(data.turnId); const runId = string(data.agentRunId);
    if (turnId && runId) runByTurn.set(turnId, runId);
    const stepId = string(data.stepId); if (stepId && turnId) turnByStep.set(stepId, turnId);
    if (event.type === "request/context") {
      const requestId = string(data.requestId); const snapshotData = record(data.snapshot); const prepared = record(snapshotData.prepared);
      if (requestId && turnId && stepId) requestById.set(requestId, { requestId, agentRunId: runByTurn.get(turnId) ?? runId ?? "system", turnId, stepId, model: string(prepared.model) ?? "default", provider: string(prepared.route) ?? "default", time: event.time });
    }
    const callId = string(data.callId); if (event.type === "tool/call" && callId) callData.set(callId, data);
    if (event.type === "delegation/requested") {
      const parentCallId = string(data.parentCallId); const presetId = string(data.presetId);
      if (parentCallId) childByCall.set(parentCallId, { childSessionId: "", presetId: presetId ?? "unknown", status: "running" });
    }
    if (event.type === "delegation/completed") {
      const invocationId = string(data.invocationId); const completed = invocationId ? journal.find((candidate) => candidate.type === "delegation/requested" && string(record(candidate.data).invocationId) === invocationId) : undefined;
      const parentCallId = completed ? string(record(completed.data).parentCallId) : null;
      if (parentCallId) childByCall.set(parentCallId, { childSessionId: string(data.childSessionId) ?? "", presetId: string(data.presetId) ?? childByCall.get(parentCallId)?.presetId ?? "unknown", status: string(data.status) ?? "completed" });
    }
  }
  return { runByTurn, turnByStep, requestById, toolByCall: new Map(snapshot.tools.map((tool) => [tool.callId, tool])), callData, childByCall };
}

function identityFor(event: SessionEventEnvelopeV1, data: EventRecord, index: EventIndex) {
  const requestId = string(data.requestId);
  const request = requestId ? index.requestById.get(requestId) : undefined;
  const callId = string(data.callId);
  const call = callId ? index.callData.get(callId) : undefined;
  const stepId = string(data.stepId) ?? string(call?.stepId) ?? request?.stepId ?? null;
  const turnId = string(data.turnId) ?? string(call?.turnId) ?? request?.turnId ?? (stepId ? index.turnByStep.get(stepId) ?? null : null);
  const agentRunId = string(data.agentRunId) ?? string(call?.agentRunId) ?? request?.agentRunId ?? (turnId ? index.runByTurn.get(turnId) ?? "system" : event.source.agentId ?? "system");
  return { requestId, turnId, stepId, agentRunId };
}

function summarizeRun(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[], index: EventIndex, agentRunId: string): AgentTraceSummary {
  const selected = journal.filter((event) => identityFor(event, record(event.data), index).agentRunId === agentRunId);
  const startedAt = selected.find((event) => event.type === "turn/start")?.time ?? selected[0]?.time ?? snapshot.createdAt;
  const terminal = [...selected].reverse().find((event) => event.type === "turn/end");
  const turnIds = [...new Set(selected.filter((event) => event.type === "turn/start").map((event) => string(record(event.data).turnId)).filter((value): value is string => value !== null))];
  const requests = selected.filter((event) => event.type === "request/context").map((event) => index.requestById.get(string(record(event.data).requestId) ?? "")).filter((value): value is RequestInfo => value !== undefined);
  const tools = snapshot.tools.filter((tool) => tool.agentRunId === agentRunId);
  const usages = selected.filter((event) => event.type === "assistant/message" || event.type === "step/end").map((event) => record(record(event.data).usage));
  const inputTokens = usages.reduce((sum, usage) => sum + nonNegative(usage.inputTokens), 0); const outputTokens = usages.reduce((sum, usage) => sum + nonNegative(usage.outputTokens), 0); const cacheReadTokens = usages.reduce((sum, usage) => sum + nonNegative(usage.cacheReadTokens), 0); const cacheWriteTokens = usages.reduce((sum, usage) => sum + nonNegative(usage.cacheWriteTokens), 0);
  const endedAt = terminal?.time; const status = terminal === undefined ? "recording" : ["failed", "aborted"].includes(string(record(terminal.data).reason) ?? "") ? "failed" : "completed";
  const turns = turnIds.map((turnId, turnIndex) => {
    const turnEvents = selected.filter((event) => identityFor(event, record(event.data), index).turnId === turnId); const turnStart = turnEvents.find((event) => event.type === "turn/start")?.time ?? startedAt; const turnEnd = [...turnEvents].reverse().find((event) => event.type === "turn/end")?.time;
    const turnRequests = requests.filter((request) => request.turnId === turnId); const turnTools = tools.filter((tool) => tool.turnId === turnId); const turnUsages = turnEvents.filter((event) => event.type === "assistant/message" || event.type === "step/end").map((event) => record(record(event.data).usage));
    return { turnId, turnIndex, startedAt: turnStart, ...(turnEnd === undefined ? {} : { endedAt: turnEnd }), llmCallCount: turnRequests.length, retryCount: turnEvents.filter((event) => event.type === "llm/retry").length, toolNames: [...new Set(turnTools.map((tool) => tool.name))], modelNames: [...new Set(turnRequests.map((request) => request.model))], inputTokens: turnUsages.reduce((sum, usage) => sum + nonNegative(usage.inputTokens), 0), outputTokens: turnUsages.reduce((sum, usage) => sum + nonNegative(usage.outputTokens), 0), cacheReadTokens: turnUsages.reduce((sum, usage) => sum + nonNegative(usage.cacheReadTokens), 0), cacheWriteTokens: turnUsages.reduce((sum, usage) => sum + nonNegative(usage.cacheWriteTokens), 0), durationMs: duration(turnStart, turnEnd) };
  });
  return { schemaVersion: 1, toolSummaryVersion: 2, sessionId: snapshot.sessionId, agentRunId, startedAt, ...(endedAt === undefined ? {} : { endedAt }), status, truncated: false, turnCount: turnIds.length, llmCallCount: requests.length, retryCount: selected.filter((event) => event.type === "llm/retry").length, eventCount: selected.length, toolNames: [...new Set(tools.map((tool) => tool.name))], modelNames: [...new Set(requests.map((request) => request.model))], inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, durationMs: duration(startedAt, endedAt), byteSize: Buffer.byteLength(JSON.stringify(selected)), turns };
}

function usageRows(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[]): UsageStatisticsRequestRow[] {
  const index = buildIndex(snapshot, journal); const byRun = new Map<string, UsageStatisticsRequestRow & { models: Map<string, number> }>();
  for (const event of journal) {
    if (event.type !== "assistant/message" && event.type !== "step/end") continue; const data = record(event.data); const requestId = string(data.requestId); const request = requestId ? index.requestById.get(requestId) : undefined; if (!request) continue;
    const usage = record(data.usage); const runId = request.agentRunId; const current = byRun.get(runId) ?? { timestamp: event.time, sessionId: snapshot.sessionId, agentRunId: runId, workspaceRoot: snapshot.workspaceRoot ?? undefined, model: request.model, provider: request.provider, modelCallCount: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, reasoningTokens: 0, costUsd: 0, models: new Map<string, number>() };
    const input = nonNegative(usage.inputTokens); const output = nonNegative(usage.outputTokens); const cacheRead = nonNegative(usage.cacheReadTokens); const cacheWrite = nonNegative(usage.cacheWriteTokens); const tokens = input + output + cacheRead + cacheWrite;
    current.timestamp = event.time; current.modelCallCount += 1; current.totalTokens += tokens; current.promptTokens += input; current.completionTokens += output; current.cacheHitTokens += cacheRead; current.cacheMissTokens += cacheWrite; current.reasoningTokens += nonNegative(usage.reasoningTokens); current.costUsd += costUsd(usage); current.models.set(request.model, (current.models.get(request.model) ?? 0) + tokens); const primary = [...current.models].sort((left, right) => right[1] - left[1])[0]?.[0]; if (primary) current.model = primary;
    byRun.set(runId, current);
  }
  return [...byRun.values()].map(({ models: _models, ...row }) => row);
}

function modelRows(rows: readonly UsageStatisticsRequestRow[]): UsageStatisticsModelEntry[] { const grouped = new Map<string, { tokens: number; calls: number; cost: number; provider?: string }>(); for (const row of rows) { const item = grouped.get(row.model) ?? { tokens: 0, calls: 0, cost: 0, provider: row.provider }; item.tokens += row.totalTokens; item.calls += row.modelCallCount; item.cost += row.costUsd; grouped.set(row.model, item); } const total = rows.reduce((sum, row) => sum + row.totalTokens, 0); return [...grouped].map(([name, item]) => ({ name, provider: item.provider, totalTokens: item.tokens, percent: total === 0 ? 0 : item.tokens / total * 100, callCount: item.calls, costUsd: item.cost })).sort((a, b) => b.totalTokens - a.totalTokens); }
function dailyUsageRows(rows: readonly UsageStatisticsRequestRow[], sessions: readonly { snapshot: RuntimeV2SessionSnapshot }[]): UsageStatisticsDailyRow[] { const grouped = new Map<string, UsageStatisticsRequestRow[]>(); for (const row of rows) { const date = row.timestamp.slice(0, 10); grouped.set(date, [...(grouped.get(date) ?? []), row]); } return [...grouped].map(([date, items]) => { const total = items.reduce((sum, item) => sum + item.totalTokens, 0); const models = modelRows(items); return { date, totalTokens: total, promptTokens: items.reduce((sum, item) => sum + item.promptTokens, 0), completionTokens: items.reduce((sum, item) => sum + item.completionTokens, 0), cacheHitTokens: items.reduce((sum, item) => sum + item.cacheHitTokens, 0), reasoningTokens: items.reduce((sum, item) => sum + item.reasoningTokens, 0), conversationCount: new Set(items.map((item) => `${item.sessionId}:${item.agentRunId}`)).size, toolCallCount: sessions.flatMap((entry) => entry.snapshot.tools).filter((tool) => tool.startedAt.startsWith(date)).length, costUsd: items.reduce((sum, item) => sum + item.costUsd, 0), modelBreakdown: models.map((model) => ({ name: model.name, totalTokens: model.totalTokens, percent: total === 0 ? 0 : model.totalTokens / total * 100 })) }; }).sort((a, b) => a.date.localeCompare(b.date)); }
function toolRows(tools: readonly RuntimeV2ToolView[]) { const grouped = new Map<string, { calls: number; failed: number; duration: number; measured: number }>(); for (const tool of tools) { const item = grouped.get(tool.name) ?? { calls: 0, failed: 0, duration: 0, measured: 0 }; item.calls += 1; if (tool.state !== "completed") item.failed += 1; if (tool.durationMs !== null) { item.duration += tool.durationMs; item.measured += 1; } grouped.set(tool.name, item); } const total = tools.length; return [...grouped].map(([name, item]) => ({ name, callCount: item.calls, percent: total === 0 ? 0 : item.calls / total * 100, failedCount: item.failed, ...(item.measured === 0 ? {} : { averageDurationMs: item.duration / item.measured }) })).sort((a, b) => b.callCount - a.callCount); }

function toolPreview(toolName: string, tool: RuntimeV2ToolView | undefined, data: EventRecord, call: EventRecord | undefined, child: EventIndex["childByCall"] extends Map<string, infer T> ? T | undefined : never, sessionId: string, agentRunId: string): ToolUiPreview {
  const localName = toolName;
  const args = record(call?.args);
  const summary = tool?.summary ?? string(data.summary) ?? "Tool completed";
  const output = modelOutputText(data.modelOutput) || toolModelOutputText(tool);
  const failed = tool?.state === "failed" || tool?.state === "denied" || tool?.state === "aborted";
  if (localName === "read_file") return { kind: "read", filePath: string(args.path) ?? "", ...(typeof args.offset === "number" || typeof args.limit === "number" ? { range: `${nonNegative(args.offset) || 1}-${(nonNegative(args.offset) || 1) + Math.max(0, nonNegative(args.limit) - 1)}` } : {}), displayText: summary };
  if (localName === "list_directory") return { kind: "directory_list", path: string(args.path) ?? ".", entryCount: countOutputLines(output), displayText: summary };
  if (localName === "grep") return { kind: "grep", pattern: string(args.pattern) ?? "", scope: string(args.path) ?? ".", resultCount: resultCount(summary), displayText: summary };
  if (localName === "glob") return { kind: "glob", pattern: string(args.pattern) ?? "", scope: string(args.path) ?? ".", resultCount: resultCount(summary), displayText: summary };
  if (localName === "web_search" || localName === "web_fetch") return { kind: "web_search", mode: localName === "web_fetch" ? "url" : "query", ...(localName === "web_fetch" ? { url: string(args.url) ?? "" } : { query: string(args.query) ?? "" }), displayText: summary, contentPreview: output.slice(0, 2_000) };
  if (localName === "write_file" || localName === "edit_file") {
    const result = record(detailValue(data, "result"));
    const filePath = string(result.path) ?? string(args.path) ?? "";
    const common = { filePath, additions: nonNegative(result.additions), deletions: nonNegative(result.deletions), diff: output.split("\n\nFile ", 1)[0] ?? "", collapsedLines: 0, status: failed ? "failed" as const : "completed" as const, ...(tool?.failure ? { errorMessage: tool.failure.message } : {}) };
    return localName === "write_file" ? { kind: "write", ...common } : { kind: "edit_diff", ...common };
  }
  if (localName === "delete_file") return { kind: "delete", filePath: string(record(detailValue(data, "result")).path) ?? string(args.path) ?? "", displayText: summary, status: failed ? "failed" : "completed" };
  if (localName === "bash" || localName === "bash_output" || localName === "bash_kill") return { kind: "bash", status: failed ? "failed" : "success", title: summary, command: string(args.command) ?? localName, commandPreview: string(args.command) ?? localName, cwd: string(args.cwd) ?? undefined, stdout: failed ? undefined : output, stderr: failed ? tool?.failure?.message ?? output : undefined, durationMs: tool?.durationMs ?? undefined, intent: string(args.intent) ?? undefined };
  if (localName === "inspect_image") return { kind: "media_analysis", mediaName: string(args.artifact_id) ?? "image", mediaKind: "image", displayText: summary };
  if (localName === "generate_image") { const images = tool?.artifacts.filter((artifact) => artifact.kind === "image").map((artifact) => ({ type: "image" as const, name: artifact.label, path: artifact.artifactId, mimeType: artifact.mimeType })) ?? []; return { kind: "image_generation", status: failed ? "failed" : images.length > 0 ? "completed" : "partial", promptPreview: string(args.prompt)?.slice(0, 240) ?? "", requestedCount: Math.max(1, nonNegative(args.n) || 1), generatedCount: images.length, size: string(args.size) ?? "1024x1024", displayText: summary, images, ...(tool?.failure ? { errorMessage: tool.failure.message } : {}) }; }
  if (toolName === "actspace.todo/todo_read" || toolName === "actspace.todo/todo_write") { const value = detailValue(data, "todo"); const todo = record(value); const todos = Array.isArray(todo.todos) ? todo.todos.map((entry) => { const item = record(entry); const status: "pending" | "in_progress" | "completed" = item.status === "in_progress" || item.status === "completed" ? item.status : "pending"; return { id: string(item.id) ?? "todo", content: string(item.content) ?? "", status, ...(typeof item.activeForm === "string" ? { activeForm: item.activeForm } : {}), createdAt: string(item.createdAt) ?? tool?.startedAt ?? new Date(0).toISOString(), updatedAt: string(item.updatedAt) ?? tool?.finishedAt ?? tool?.startedAt ?? new Date(0).toISOString() }; }) : []; return { kind: "todo", todos, totalCount: todos.length, completedCount: todos.filter((item) => item.status === "completed").length, revision: nonNegative(todo.revision), displayText: `${todos.filter((item) => item.status === "completed").length}/${todos.length} completed` }; }
  if (toolName === "actspace.subagent/agent" || toolName === "actspace.subagent/explore") { const detail = record(detailValue(data, "delegation")); const childSessionId = string(detail.childSessionId) ?? child?.childSessionId ?? ""; const presetId = string(detail.presetId) ?? child?.presetId ?? (toolName.endsWith("/explore") ? "actspace.explore" : "actspace.agent"); const status = child?.status === "aborted" ? "aborted" : child?.status === "failed" || tool?.state === "failed" ? "failed" : tool?.state === "running" ? "running" : "completed"; return { kind: "agent", description: toolName.endsWith("/explore") ? "Explore" : "Agent", status, subagentType: "explore", displayText: tool?.summary ?? (status === "running" ? "Working" : "Completed"), summary: toolModelOutputText(tool), ...(childSessionId ? { transcriptRef: { kind: "subagent_transcript", sessionId, agentRunId, runId: childSessionId } } : {}), stats: { durationMs: tool?.durationMs ?? 0, toolCallCount: 0 }, display: presetId === "actspace.explore" ? "inline" : "panel", ...(tool?.failure ? { error: tool.failure.message } : {}) }; }
  return { kind: "generic", title: toolName, content: [tool?.summary, toolModelOutputText(tool), tool?.failure?.message].filter(Boolean).join("\n\n") || "Tool completed" };
}

function resultCount(summary: string): number | undefined { const match = /(?:Found|Listed)\s+(\d+)/i.exec(summary); return match ? Number(match[1]) : undefined; }
function countOutputLines(output: string): number | undefined { const lines = output.split("\n").filter((line) => line.trim()); return lines.length === 0 ? undefined : lines.length; }

function totalsFromRuns(runs: readonly AgentTraceSummary[]) { return runs.reduce((total, run) => ({ agentRunCount: total.agentRunCount + 1, turnCount: total.turnCount + run.turnCount, llmCallCount: total.llmCallCount + run.llmCallCount, inputTokens: total.inputTokens + run.inputTokens, outputTokens: total.outputTokens + run.outputTokens, cacheReadTokens: total.cacheReadTokens + run.cacheReadTokens, cacheWriteTokens: total.cacheWriteTokens + run.cacheWriteTokens, durationMs: total.durationMs + run.durationMs }), { agentRunCount: 0, turnCount: 0, llmCallCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, durationMs: 0 }); }
function userMessagePreview(snapshot: RuntimeV2SessionSnapshot, journal: readonly SessionEventEnvelopeV1[], runId: string): string { const event = journal.find((candidate) => candidate.type === "user/message" && string(record(candidate.data).agentRunId) === runId); return event ? contentText(appendNode(event)?.content ?? "").slice(0, 240) : snapshot.metadata.title ?? ""; }
function appendNode(event: SessionEventEnvelopeV1) { return event.surface?.kind === "append" ? event.surface.node : null; }
function contentBlocks(value: RuntimeV2JsonValue): readonly EventRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function array(value: RuntimeV2JsonValue | undefined): readonly RuntimeV2JsonValue[] { return Array.isArray(value) ? value : []; }
function contextPreview(value: RuntimeV2JsonValue): string {
  if (typeof value === "string") return value.trim();
  const encoded = JSON.stringify(value, null, 2);
  return encoded === undefined ? "" : encoded.trim();
}
function estimateTokens(value: string): number {
  if (!value) return 0;
  const ascii = [...value].filter((character) => character.codePointAt(0)! <= 0x7f).length;
  return Math.max(1, Math.ceil((ascii / 4) + (value.length - ascii)));
}
function contentText(value: RuntimeV2JsonValue, includeReasoning = true): string { if (typeof value === "string") return value; if (!Array.isArray(value)) return JSON.stringify(value ?? null, null, 2); return value.flatMap((entry) => { if (typeof entry === "string") return [entry]; if (!isRecord(entry)) return [JSON.stringify(entry)]; if (entry.type === "text" && typeof entry.text === "string") return [entry.text]; if (includeReasoning && entry.type === "reasoning" && typeof entry.text === "string") return [entry.text]; if (entry.type === "artifact") return [typeof entry.label === "string" ? `[${entry.label}]` : "[attachment]"]; return []; }).join(""); }
function attachmentViews(value: RuntimeV2JsonValue | undefined) { return contentBlocks(value ?? []).filter((entry) => entry.type === "artifact").map((entry, index) => ({ id: string(record(entry.artifact).artifactId) ?? `attachment-${index}`, kind: (string(record(entry.artifact).mediaType)?.startsWith("image/") ? "image" : "file") as "image" | "file", name: string(entry.label) ?? `Attachment ${index + 1}`, mimeType: string(record(entry.artifact).mediaType) ?? undefined })); }
function detailValue(data: EventRecord, label: string): RuntimeV2JsonValue { if (!Array.isArray(data.detail)) return null; for (const entry of data.detail) { const detail = record(entry); if (detail.label === label) return detail.value ?? null; } return null; }
function modelOutputText(value: RuntimeV2JsonValue | undefined): string { if (!Array.isArray(value)) return ""; return value.map((entry) => { const block = record(entry); return typeof block.text === "string" ? block.text : block.value === undefined ? "" : JSON.stringify(block.value); }).filter(Boolean).join("\n"); }
function toolModelOutputText(tool: RuntimeV2ToolView | undefined): string { return tool?.modelOutput?.map((block) => block.type === "text" ? block.text : `${block.alt} (${block.artifactId})`).join("\n") ?? ""; }
function findCompactionStart(events: readonly SessionEventEnvelopeV1[], id: string | null) { if (!id) return undefined; const event = events.find((candidate) => candidate.type === "compaction/start" && string(record(candidate.data).compactionId) === id); return event === undefined ? undefined : { data: record(event.data) }; }
function isToolTerminal(type: string): boolean { return type === "tool/result" || type === "tool/recovery-outcome"; }
function eventId(event: SessionEventEnvelopeV1): string { return `v2-${event.seq}`; }
function record(value: RuntimeV2JsonValue | undefined): EventRecord { return isRecord(value) ? value : {}; }
function isRecord(value: RuntimeV2JsonValue | undefined): value is EventRecord { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function nonNegative(value: RuntimeV2JsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }
function costUsd(usage: EventRecord): number { const value = nonNegative(usage.cost); return string(usage.costCurrency)?.toUpperCase() === "CNY" ? value / 7.2 : value; }
function duration(start: string, end?: string): number { if (!end) return 0; const value = Date.parse(end) - Date.parse(start); return Number.isFinite(value) && value > 0 ? value : 0; }
function inRange(timestamp: string, range: UsageStatisticsSnapshot["range"]): boolean { if (range === "total") return true; const days = range === "day" ? 1 : range === "week" ? 7 : 30; return Date.parse(timestamp) >= Date.now() - days * 86_400_000; }
