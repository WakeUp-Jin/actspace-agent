import { contextCategory, contextSectionRecords, fixedSystemText } from "./context-sections";
import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type {
  TrajectoryAssistantMetrics,
  TrajectoryCompactionFacts,
  TrajectoryDetail,
  TrajectoryPromptDetail,
  TrajectoryRecord,
  TrajectoryRecordKind,
  TrajectoryRecordState,
  TrajectoryRequestDetail,
  TrajectoryRuntimeSnapshot,
  TrajectorySourceBlock,
  TrajectorySystemChangeKind,
  TrajectoryTurn,
  TrajectoryUsage,
} from "./contract";
import { appendChunks, closedKey, chunkKey, emptyLiveContent, liveFields } from "./live";
import { asRecord, type Data, dataOf, json, pick, sourceBlocks, text, valueText } from "./node-data";

type RequestFact = {
  id: string;
  header: RuntimeV2TrajectoryNode | null;
  context: RuntimeV2TrajectoryNode | null;
  sequences: number[];
  turnId: string | null;
  stepId: string | null;
  provider: string | null;
  model: string | null;
  options: RuntimeV2JsonValue | null;
  prompt: TrajectoryPromptDetail | null;
  startedAt: string | null;
  completedAt: string | null;
  state: TrajectoryRecordState;
  usage: TrajectoryUsage | null;
};
type Boundary = { start: string | null; end: string | null };
type TurnBoundary = Boundary & { state: TrajectoryRecordState };
type EventContext = { turnId: string | null; stepId: string | null };

const numberValue = (value: RuntimeV2JsonValue | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const parseTime = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const duration = (start: string | null, end: string | null): number | null => {
  const a = parseTime(start);
  const b = parseTime(end);
  return a === null || b === null || b < a ? null : b - a;
};

/** Bind navigation and schemas after call/result merging; all links use identities. */
function associateCalls(records: readonly TrajectoryRecord[]): TrajectoryRecord[] {
  const assistants = records.filter(record => record.kind === "assistant");
  const calls = new Map(records.filter(record => record.kind === "tool" && record.callId).map(record => [record.callId!, record]));
  const owners = new Map<string, Set<TrajectoryRecord>>();
  for (const assistant of assistants) {
    for (const block of assistant.sourceBlocks ?? []) {
      if (block.type !== "tool-call" || !block.callId) continue;
      const candidates = owners.get(block.callId) ?? new Set();
      candidates.add(assistant);
      owners.set(block.callId, candidates);
    }
  }
  const ownerFor = (call: TrajectoryRecord, seen = new Set<string>()): TrajectoryRecord | null => {
    if (!call.callId || seen.has(call.callId)) return null;
    seen.add(call.callId);
    const messageId = pick(asRecord(call.raw), ["assistantMessageId"]);
    const candidates = new Set(owners.get(call.callId));
    if (messageId) assistants.filter(record => record.messageId === messageId).forEach(record => candidates.add(record));
    if (candidates.size > 0) return candidates.size === 1 ? [...candidates][0]! : null;
    const parent = call.parentCallId ? calls.get(call.parentCallId) : undefined;
    return parent ? ownerFor(parent, seen) : null;
  };
  return records.map(record => {
    if (record.kind !== "tool") return record;
    const owner = ownerFor(record);
    // A nested dispatch without its own request inherits the owner's snapshot.
    const explicitRequest = pick(asRecord(record.raw), ["requestId"]);
    const request = explicitRequest ? record.requestDetail : owner?.requestDetail ?? null;
    const tools = request?.prompt?.tools;
    const schema = Array.isArray(tools) ? tools.find(tool => asRecord(tool).name === record.toolName) : undefined;
    return { ...record, assistantRecordId: owner?.id ?? null,
      requestId: explicitRequest ?? request?.requestId ?? null, requestDetail: request,
      schemaDetail: record.schemaDetail ?? schema ?? null };
  });
}

function recordKind(node: RuntimeV2TrajectoryNode): TrajectoryRecordKind {
  const type = node.eventType;
  if (type === "user/message" || type === "agent/inbox/spliced") return "user";
  if (type.startsWith("system/") || type.startsWith("prompt/")) return "system";
  if (type.startsWith("assistant/")) return "assistant";
  if (type === "tool/call" || type === "tool/result") return "tool";
  if (type.startsWith("request/")) return type === "request/context" ? "context" : "request";
  if (type === "llm/auxiliary-start" || type === "llm/auxiliary-end") return "request";
  if (type.startsWith("turn/")) return "turn";
  if (type.startsWith("step/")) return "step";
  if (type.startsWith("permission/")) return "approval";
  if (type.startsWith("llm/retry") || type.startsWith("retry/")) return "retry";
  if (type.startsWith("compaction/")) return "compaction";
  if (type.includes("error") || type === "error") return "error";
  return "raw";
}

function recordState(node: RuntimeV2TrajectoryNode): TrajectoryRecordState {
  const data = dataOf(node);
  if (node.state === "failed" || data.status === "failed" || data.status === "denied" || data.finishReason === "failed") return "failed";
  if (node.state === "aborted" || data.status === "aborted" || data.reason === "aborted" || data.finishReason === "aborted") return "aborted";
  if (node.state === "started") return "running";
  return node.state;
}

function usage(data: Data): TrajectoryUsage | null {
  const value = asRecord(data.usage);
  const result = {
    inputTokens: numberValue(value.inputTokens),
    outputTokens: numberValue(value.outputTokens),
    reasoningTokens: numberValue(value.reasoningTokens),
    cacheReadTokens: numberValue(value.cacheReadTokens),
    cacheWriteTokens: numberValue(value.cacheWriteTokens),
  };
  return Object.values(result).some(item => item !== null) ? result : null;
}

function promptDetail(data: Data): TrajectoryPromptDetail | null {
  const header = asRecord(data.header);
  const direct = data.promptSnapshot ?? data.prompt ?? data.requestPrompt ?? data.snapshot ?? data.header;
  const directRecord = asRecord(direct);
  const directText = typeof direct === "string" ? direct : null;
  const systemPrompt = text(data.systemPrompt)
    ?? text(data.system)
    ?? directText
    ?? text(directRecord.systemPrompt)
    ?? text(directRecord.system)
    ?? text(directRecord.renderedSystemPrompt);
  const systemPromptParts = data.systemPromptParts ?? directRecord.systemPromptParts ?? directRecord.systemParts ?? directRecord.systemSections;
  const tools = data.tools ?? directRecord.tools ?? header.tools;
  const config = data.config ?? directRecord.config ?? directRecord.requestOptions ?? header.config;
  const hasRaw = direct !== undefined
    || data.systemPrompt !== undefined
    || data.system !== undefined
    || data.systemPromptParts !== undefined
    || data.tools !== undefined
    || data.config !== undefined
    || header.system !== undefined
    || header.tools !== undefined;
  if (!hasRaw || (systemPrompt === null && systemPromptParts === undefined && tools === undefined && config === undefined)) return null;
  return {
    ...(systemPrompt === null ? {} : { systemPrompt }),
    ...(directRecord.contextSections === undefined ? {} : { contextSections: directRecord.contextSections }),
    ...(directRecord.contextModelFacts === undefined ? {} : { contextModelFacts: directRecord.contextModelFacts }),
    ...(systemPromptParts === undefined ? {} : { systemPromptParts }),
    ...(tools === undefined ? {} : { tools }),
    ...(config === undefined ? {} : { config }),
    raw: direct ?? data,
  };
}

/** 系统行只看系统提示词和工具：模型、请求选项变化不算提示词变化（对齐 DSH）。 */
const systemSignature = (prompt: TrajectoryPromptDetail): string => JSON.stringify(fixedSystemText(prompt));
const toolsSignature = (prompt: TrajectoryPromptDetail): string => JSON.stringify(prompt.tools ?? null);
const hasPromptBody = (prompt: TrajectoryPromptDetail | null): boolean =>
  prompt !== null && (typeof prompt.systemPrompt === "string" || prompt.systemPromptParts !== undefined || prompt.tools !== undefined);

function promptSignature(prompt: TrajectoryPromptDetail): string {
  try { return `${systemSignature(prompt)}\u0000${toolsSignature(prompt)}`; } catch { return ""; }
}

/** 历史窗口里与上一次请求相同的提示词只带 `promptUnchanged`（session-controller slimHistoryWindow），沿用上一份正文。 */
function inheritPrompt(data: Data, prompt: TrajectoryPromptDetail | null, last: TrajectoryPromptDetail | null): TrajectoryPromptDetail | null {
  if (hasPromptBody(prompt) || last === null || asRecord(data.snapshot).promptUnchanged !== true) return prompt;
  const { systemPrompt, systemPromptParts, tools, contextSections, contextModelFacts } = last;
  return {
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    ...(contextSections === undefined ? {} : { contextSections }),
    ...(contextModelFacts === undefined ? {} : { contextModelFacts }),
    ...(systemPromptParts === undefined ? {} : { systemPromptParts }),
    ...(tools === undefined ? {} : { tools }),
    ...(prompt?.config === undefined ? {} : { config: prompt.config }),
    raw: prompt?.raw ?? data,
  };
}

function isPromptChange(node: RuntimeV2TrajectoryNode, prompt: TrajectoryPromptDetail | null): boolean {
  const type = node.eventType.toLocaleLowerCase();
  const data = dataOf(node);
  return prompt !== null && (
    data.promptChange !== undefined
    || data.systemPromptChanged === true
    || type === "system/prompt"
    || type.includes("prompt/change")
    || type.includes("prompt/update")
    || type.includes("tools/change")
    || type.includes("tools/update")
    || type.includes("system/update")
  );
}

function changeKind(node: RuntimeV2TrajectoryNode, previous: TrajectoryPromptDetail | null, prompt: TrajectoryPromptDetail): TrajectorySystemChangeKind {
  const data = dataOf(node);
  const change = asRecord(data.promptChange);
  const explicit = pick(data, ["changeKind", "promptChangeKind"])
    ?? pick(change, ["kind", "changeKind"]);
  if (explicit === "initial") return "initial";
  if (explicit === "tools" || explicit === "tools-updated") return "tools-updated";
  if (explicit === "prompt" || explicit === "prompt-updated" || explicit === "system") return "prompt-updated";
  if (explicit === "system-and-tools" || explicit === "prompt-and-tools") return "updated";
  if (previous === null) return "initial";
  const systemChanged = systemSignature(previous) !== systemSignature(prompt);
  const toolsChanged = toolsSignature(previous) !== toolsSignature(prompt);
  if (systemChanged && toolsChanged) return "updated";
  if (toolsChanged) return "tools-updated";
  if (systemChanged) return "prompt-updated";
  return node.eventType.toLocaleLowerCase().includes("tool") ? "tools-updated" : "prompt-updated";
}

function eventRecordId(node: RuntimeV2TrajectoryNode, index: number): string {
  const data = dataOf(node);
  const messageId = pick(data, ["messageId"]);
  const callId = node.callId ?? pick(data, ["callId", "toolCallId"]);
  if (messageId !== null && node.eventType.startsWith("assistant/")) return `${node.sessionId}:record:assistant:${messageId}`;
  if (messageId !== null && node.eventType === "user/message") return `${node.sessionId}:record:user:${messageId}`;
  if (callId !== null && (node.eventType.startsWith("tool/") || node.eventType.startsWith("permission/"))) return `${node.sessionId}:record:tool:${callId}`;
  return `${node.sessionId}:record:${node.eventType}:${node.eventSeq}:${index}`;
}

function summaryFor(node: RuntimeV2TrajectoryNode, result: string | null = null): string {
  const data = dataOf(node);
  if (node.eventType === "assistant/chunk") return "";
  if (node.eventType === "assistant/message") return valueText(data.content ?? data.message ?? data.summary);
  if (node.eventType === "tool/call") {
    const name = pick(data, ["name", "toolName"]) ?? "tool";
    const args = data.arguments ?? data.args ?? data.input ?? data.command ?? data.query ?? data.path;
    return [name, json(args)].filter(Boolean).join(" ");
  }
  if (node.eventType === "tool/result") return result ?? pick(data, ["status", "result", "content", "message", "summary"]) ?? "";
  return pick(data, ["content", "summary", "message", "reason", "decision", "name", "status"]) ?? (valueText(node.data) || node.eventType);
}

function baseRecord(
  node: RuntimeV2TrajectoryNode,
  index: number,
  sourceSequences: readonly number[] = [node.eventSeq],
  overrides: Partial<TrajectoryRecord> = {},
): TrajectoryRecord {
  const data = dataOf(node);
  const kind = recordKind(node);
  const startedAt = pick(data, ["startedAt", "startTime"])
    ?? (node.eventType.endsWith("/start") || node.eventType === "tool/call" || node.eventType === "user/message" ? node.time : null);
  const completedAt = pick(data, ["completedAt", "finishedAt", "endTime"])
    ?? (node.eventType.endsWith("/end") || node.eventType === "assistant/message" || node.eventType === "tool/result" ? node.time : null);
  const result = pick(data, ["result", "output"]);
  return {
    id: eventRecordId(node, index),
    kind,
    state: recordState(node),
    eventType: node.eventType,
    turnId: pick(data, ["turnId", "turn"]) ?? null,
    turnNumber: numberValue(data.turnNumber),
    stepId: pick(data, ["stepId", "step"]) ?? null,
    stepNumber: numberValue(data.stepNumber),
    callId: node.callId ?? pick(data, ["callId", "toolCallId"]),
    requestId: pick(data, node.eventType.startsWith("llm/auxiliary-") ? ["attemptId"] : ["requestId"]) ?? null,
    messageId: pick(data, ["messageId"]) ?? null,
    summary: summaryFor(node, result),
    preview: summaryFor(node, result),
    raw: node.data,
    sourceSequences: [...sourceSequences],
    startedAt,
    completedAt,
    durationMs: duration(startedAt, completedAt),
    usage: usage(data),
    result,
    isError: node.state === "failed" || data.status === "failed" || data.isError === true,
    partial: node.eventType === "assistant/chunk",
    visible: false,
    inputDetail: null,
    outputDetail: null,
    thinkingDetail: text(data.thinking) ?? text(data.reasoning),
    schemaDetail: data.schema ?? data.toolSchema ?? data.schemaDetail ?? null,
    toolName: pick(data, ["name", "toolName"]),
    toolArguments: data.arguments ?? data.args ?? data.input ?? null,
    hierarchy: pick(data, ["hierarchy", "parentCallId"]),
    timingSource: pick(data, ["timingSource"]) ?? "Session timestamps",
    ...overrides,
  };
}

function assistantMetrics(
  record: TrajectoryRecord,
  stepStartAt: string | null,
  firstTokenAt: string | null,
  completedAt: string | null,
): TrajectoryAssistantMetrics {
  const stepStartTime = parseTime(stepStartAt);
  const firstTokenTime = parseTime(firstTokenAt);
  const completedTime = parseTime(completedAt);
  const ttftMs = stepStartTime !== null && firstTokenTime !== null ? Math.max(0, firstTokenTime - stepStartTime) : null;
  const generationMs = firstTokenTime !== null && completedTime !== null ? Math.max(0, completedTime - firstTokenTime) : null;
  const outputTokens = record.usage?.outputTokens ?? null;
  return {
    timingRecorded: stepStartTime !== null || firstTokenTime !== null || completedTime !== null,
    stepStartAt,
    firstTokenAt,
    completedAt,
    stepStartTime,
    firstTokenTime,
    completedTime,
    ttftMs,
    generationMs,
    throughputTokensPerSecond: outputTokens !== null && generationMs !== null && generationMs > 0 ? outputTokens / (generationMs / 1_000) : null,
    usageProvided: record.usage !== null,
    outputTokens,
  };
}

function buildEventContexts(nodes: readonly RuntimeV2TrajectoryNode[]): Map<number, EventContext> {
  const contexts = new Map<number, EventContext>();
  let activeTurn: string | null = null;
  let activeStep: string | null = null;
  for (const node of [...nodes].sort((a, b) => a.eventSeq - b.eventSeq)) {
    const data = dataOf(node);
    const explicitTurn = pick(data, ["turnId", "turn"]);
    const explicitStep = pick(data, ["stepId", "step"]);
    if (node.eventType === "turn/start" && explicitTurn !== null) activeTurn = explicitTurn;
    if (node.eventType === "step/start" && explicitStep !== null) activeStep = explicitStep;
    // 用户消息先于 turn/start 写入且不带 turnId：归到同一 agentRun 的下一个轮次。
    const agentRunId = pick(data, ["agentRunId"]);
    const claimedTurn = node.eventType === "agent/inbox/spliced" && data.operation === "claim" && data.target === "next-turn"
      ? nodes.find(item => item.eventSeq > node.eventSeq && item.eventType === "turn/start")
      : node.eventType === "user/message" && explicitTurn === null && activeTurn === null
        ? nodes.find(item => item.eventSeq > node.eventSeq && item.eventType === "turn/start" && pick(dataOf(item), ["agentRunId"]) === agentRunId)
        : undefined;
    contexts.set(node.eventSeq, { turnId: explicitTurn ?? (claimedTurn ? pick(dataOf(claimedTurn), ["turnId"]) : activeTurn), stepId: explicitStep ?? activeStep });
    if (node.eventType === "step/end") activeStep = null;
    if (node.eventType === "turn/end") { activeStep = null; activeTurn = null; }
  }
  return contexts;
}

function mergeNodes(nodes: readonly RuntimeV2TrajectoryNode[], placeholders?: ReadonlySet<string>): {
  records: TrajectoryRecord[];
  rawRecords: TrajectoryRecord[];
  partial: TrajectoryRecord | null;
  requests: Map<string, RequestFact>;
  requestByStep: Map<string, RequestFact>;
  stepBoundaries: Map<string, Boundary>;
  turnBoundaries: Map<string, TurnBoundary>;
} {
  const ordered = [...nodes].sort((a, b) => a.eventSeq - b.eventSeq);
  const rawRecords = ordered.map((node, index) => baseRecord(node, index, [node.eventSeq], {
    visible: false,
    requestOnly: node.eventType === "request/header" || node.eventType === "request/context",
  }));
  const records: TrajectoryRecord[] = [];
  const calls = new Map<string, { index: number; record: TrajectoryRecord }>();
  const chunks = new Map<string, RuntimeV2TrajectoryNode[]>();
  const pendingApprovals = new Map<string, RuntimeV2TrajectoryNode[]>();
  const requests = new Map<string, RequestFact>();
  const requestByStep = new Map<string, RequestFact>();
  const stepBoundaries = new Map<string, Boundary>();
  const turnBoundaries = new Map<string, TurnBoundary>();
  const contexts = buildEventContexts(ordered);
  let lastPrompt: TrajectoryPromptDetail | null = null;

  for (const node of ordered) {
    const data = dataOf(node);
    const requestId = pick(data, ["requestId"]);
    const turnId = pick(data, ["turnId", "turn"]);
    const stepId = pick(data, ["stepId", "step"]);
    if (node.eventType === "turn/start" && turnId !== null) turnBoundaries.set(turnId, { start: node.time, end: null, state: "running" });
    if (node.eventType === "turn/end" && turnId !== null) {
      const old = turnBoundaries.get(turnId) ?? { start: null, end: null, state: "running" as const };
      turnBoundaries.set(turnId, { ...old, end: node.time, state: recordState(node) });
    }
    if (node.eventType === "step/start" && turnId !== null && stepId !== null) stepBoundaries.set(`${turnId}\u0000${stepId}`, { start: node.time, end: null });
    if (node.eventType === "step/end" && turnId !== null && stepId !== null) {
      const key = `${turnId}\u0000${stepId}`;
      stepBoundaries.set(key, { ...(stepBoundaries.get(key) ?? { start: null }), end: node.time });
    }
    if (node.eventType === "request/header" || node.eventType === "request/context") {
      if (requestId !== null) {
        const fact: RequestFact = requests.get(requestId) ?? {
          id: requestId, header: null, context: null, sequences: [], turnId, stepId,
          provider: null, model: null, options: null, prompt: null, startedAt: node.time,
          completedAt: null, state: "running", usage: null,
        };
        const prepared = asRecord(asRecord(data.snapshot).prepared);
        fact.provider = pick(data, ["provider", "routeId"]) ?? pick(prepared, ["route"]) ?? fact.provider;
        fact.model = pick(data, ["model"]) ?? pick(prepared, ["model"]) ?? fact.model;
        fact.options = data.options ?? data.requestOptions ?? asRecord(data.snapshot).requestOptions ?? fact.options;
        const prompt = inheritPrompt(data, promptDetail(data), lastPrompt);
        if (hasPromptBody(prompt)) lastPrompt = prompt;
        fact.prompt = prompt ?? fact.prompt;
        fact.sequences.push(node.eventSeq);
        if (node.eventType === "request/header") fact.header = node;
        else fact.context = node;
        fact.turnId = fact.turnId ?? turnId;
        fact.stepId = fact.stepId ?? stepId;
        requests.set(requestId, fact);
        if (fact.turnId !== null && fact.stepId !== null) requestByStep.set(`${fact.turnId}\u0000${fact.stepId}`, fact);
      }
      continue;
    }
    if (node.eventType === "llm/retry" && requestId !== null) {
      requests.get(requestId)?.sequences.push(node.eventSeq);
      continue;
    }
    if (node.eventType === "assistant/chunk") {
      const key = chunkKey(node);
      const list = chunks.get(key);
      if (list === undefined) chunks.set(key, [node]); else list.push(node);
      continue;
    }
    if (node.eventType === "assistant/message") {
      const closing = closedKey(node, chunks);
      const chunkList = closing === undefined ? [] : chunks.get(closing)!;
      const source = [...chunkList.map(item => item.eventSeq), node.eventSeq];
      const raw = baseRecord(node, node.eventSeq, source, { kind: "assistant", visible: true, partial: false, ...(closing ? { id: `${node.sessionId}:record:assistant:${closing}` } : {}) });
      const firstNonEmptyChunk = chunkList.find(item => valueText(dataOf(item).delta ?? dataOf(item).content) !== "");
      const context = contexts.get(node.eventSeq) ?? { turnId: raw.turnId, stepId: raw.stepId };
      const stepKey = context.turnId !== null && context.stepId !== null ? `${context.turnId}\u0000${context.stepId}` : null;
      const stepStartAt = pick(data, ["stepStartAt", "stepStartTime"])
        ?? (requestId === null ? null : requests.get(requestId)?.header?.time)
        ?? (stepKey === null ? null : stepBoundaries.get(stepKey)?.start)
        ?? (context.turnId === null ? null : turnBoundaries.get(context.turnId)?.start)
        ?? firstNonEmptyChunk?.time
        ?? chunkList[0]?.time
        ?? null;
      const firstTokenAt = pick(data, ["firstTokenAt", "firstTokenTime"])
        ?? firstNonEmptyChunk?.time
        ?? chunkList[0]?.time
        ?? null;
      const contentValue = data.content ?? data.message ?? data.output;
      const thinkingValue = data.thinking ?? data.reasoning;
      const blocks = sourceBlocks(contentValue);
      const thinkingBlocks = blocks.filter(block => block.type === "thinking" || block.type === "reasoning");
      const separateThinking = valueText(thinkingValue);
      const allBlocks = [
        ...(separateThinking && thinkingBlocks.length === 0 ? [{ type: "thinking", content: separateThinking, raw: thinkingValue }] : []),
        ...blocks,
        ...sourceBlocks(data.toolCalls ?? data.tool_calls, "tool-call"),
      ];
      const content = blocks.filter(block => block.type === "text").map(block => block.content).join("\n\n")
        || (contentValue == null ? appendChunks(emptyLiveContent(), chunkList).text : "");
      const summary = content || thinkingBlocks.map(block => block.content).join(" ");
      const enrichedBase: TrajectoryRecord = {
        ...raw,
        turnId: raw.turnId ?? context.turnId,
        stepId: raw.stepId ?? context.stepId,
        startedAt: stepStartAt,
        completedAt: pick(data, ["completedAt", "finishedAt"]) ?? node.time,
        durationMs: duration(stepStartAt, pick(data, ["completedAt", "finishedAt"]) ?? node.time),
        summary,
        preview: summary || valueText(thinkingValue),
        inputDetail: data.input ?? data.prompt ?? null,
        outputDetail: contentValue ?? (content === "" ? null : content),
        thinkingDetail: thinkingBlocks.map(block => block.content).join("\n\n") || separateThinking || null,
        sourceBlocks: allBlocks.length ? allBlocks : sourceBlocks(content),
        usage: usage(data),
      };
      records.push({ ...enrichedBase, assistantMetrics: assistantMetrics(enrichedBase, stepStartAt, firstTokenAt, enrichedBase.completedAt) });
      if (closing !== undefined) chunks.delete(closing);
      continue;
    }
    if (node.eventType === "tool/call") {
      const callId = node.callId ?? pick(data, ["callId", "toolCallId"]);
      if (callId === null) continue;
      const toolName = pick(data, ["name", "toolName"]) ?? "tool";
      const args = data.arguments ?? data.args ?? data.input ?? data.command ?? data.query ?? (data.path === undefined ? null : { path: data.path });
      const context = contexts.get(node.eventSeq) ?? { turnId, stepId };
      const record = {
        ...baseRecord(node, node.eventSeq, [node.eventSeq], { kind: "tool", visible: true, state: "running", callId, turnId: baseRecord(node, node.eventSeq).turnId ?? context.turnId, stepId: baseRecord(node, node.eventSeq).stepId ?? context.stepId }),
        toolName,
        toolArguments: args,
        inputDetail: args,
        schemaDetail: data.schema ?? data.schemaDetail ?? data.toolSchema ?? null,
        hierarchy: pick(data, ["hierarchy", "parentCallId"]) ?? "Assistant Message",
        parentCallId: pick(data, ["parentCallId"]),
        timingSource: pick(data, ["timingSource"]) ?? "Session timestamps",
        summary: [toolName, json(args)].filter(Boolean).join(" "),
        preview: [toolName, json(args)].filter(Boolean).join(" "),
      } as TrajectoryRecord;
      records.push(record);
      calls.set(callId, { index: records.length - 1, record });
      const pending = pendingApprovals.get(callId);
      if (pending !== undefined) {
        const next = { ...record, sourceSequences: [...record.sourceSequences, ...pending.map(item => item.eventSeq)] };
        records[records.length - 1] = next;
        calls.set(callId, { index: records.length - 1, record: next });
        pendingApprovals.delete(callId);
      }
      continue;
    }
    if (node.eventType === "tool/result") {
      const callId = node.callId ?? pick(data, ["callId", "toolCallId"]);
      if (callId === null) continue;
      const existing = calls.get(callId);
      const result = pick(data, ["result", "output", "content", "message", "summary"]);
      if (existing === undefined) {
        records.push({
          ...baseRecord(node, node.eventSeq, [node.eventSeq], { kind: "tool", visible: true, callId }),
          result,
          outputDetail: data.modelOutput ?? data.result ?? data.output ?? data.content ?? result,
          outputBlocks: sourceBlocks(data.modelOutput ?? data.result ?? data.output ?? data.content ?? result, "result"),
          resultRaw: node.data,
        });
      } else {
        const completedAt = pick(data, ["completedAt", "finishedAt"]) ?? node.time;
        const output = data.modelOutput ?? data.result ?? data.output ?? data.content ?? result;
        const next: TrajectoryRecord = {
          ...existing.record,
          state: recordState(node),
          sourceSequences: [...existing.record.sourceSequences, node.eventSeq],
          completedAt,
          durationMs: duration(existing.record.startedAt, completedAt),
          result,
          resultRaw: node.data,
          outputDetail: output,
          outputBlocks: sourceBlocks(output, "result"),
          preview: result === null ? existing.record.preview : `${existing.record.summary} · ${result}`,
          isError: existing.record.isError || recordState(node) === "failed" || data.isError === true,
        };
        records[existing.index] = next;
        calls.set(callId, { index: existing.index, record: next });
      }
      continue;
    }
    if ((node.eventType === "permission/asked" || node.eventType === "permission/decided") && node.callId !== null) {
      const existing = calls.get(node.callId);
      if (existing === undefined) {
        pendingApprovals.set(node.callId, [...(pendingApprovals.get(node.callId) ?? []), node]);
      } else {
        const next = { ...existing.record, sourceSequences: [...existing.record.sourceSequences, node.eventSeq], state: existing.record.state };
        records[existing.index] = next;
        calls.set(node.callId, { index: existing.index, record: next });
      }
      continue;
    }
    const kind = recordKind(node);
    const surface = asRecord(node.surface);
    const surfaceNode = asRecord(surface.node);
    if (node.eventType === "agent/inbox/spliced" && (data.operation !== "claim" || surfaceNode.kind !== "user")) continue;
    // Background task notifications and Context supplements reach the model as user content but are CONTEXT rows.
    const notice = node.eventType === "agent/inbox/spliced" && data.source === "task_notification";
    const supplement = node.eventType === "plugin/actspace.context/supplement" && data.op === "add";
    if (kind === "user" || supplement) {
      const content = data.content ?? data.message ?? data.text ?? surfaceNode.content ?? null;
      const blocks = sourceBlocks(content);
      const text = blocks.filter(block => block.type === "text").map(block => block.content).join("\n\n");
      const context = contexts.get(node.eventSeq);
      records.push(baseRecord(node, node.eventSeq, [node.eventSeq], {
        id: `${node.sessionId}:record:${supplement ? "context" : "user"}:${pick(data, ["messageId"]) ?? node.eventSeq}`,
        kind: notice || supplement ? "context" : "user",
        ...(notice || supplement ? { contextPresentation: { category: contextCategory(notice ? "task-notification" : String(data.owner ?? ""), String(data.id ?? "")), title: notice ? "任务通知" : String(data.id ?? "动态补充"), action: "已注入", placement: "user" } } : {}),
        visible: true, turnId: context?.turnId ?? pick(data, ["turnId"]), stepId: null,
        summary: text, preview: text,
        inputDetail: content, outputDetail: null,
        messageSource: supplement ? { kind: data.owner ?? null, id: data.id ?? null, lifetime: data.lifetime ?? null }
          : notice ? { ...asRecord(node.data), kind: "task-notification", form: "notice" } : data.source ?? node.source ?? null,
        startedAt: node.time, durationMs: 0, sourceBlocks: blocks,
      }));
      continue;
    }
    if (node.eventType.startsWith("compaction/") || (node.eventType === "surface/replaced" && data.compactionId)) {
      const compactionId = pick(data, ["compactionId"]);
      const index = compactionId ? records.findIndex(record => record.kind === "compaction" && pick(asRecord(record.raw), ["compactionId"]) === compactionId) : -1;
      const previous = index < 0 ? undefined : records[index];
      const summaryContent = data.summary ?? data.content ?? surfaceNode.content;
      const content = valueText(summaryContent);
      const ended = node.eventType === "compaction/end" || node.eventType === "compaction/completed";
      const start = previous?.startedAt ?? node.time;
      const compaction = compactionFacts(previous?.compaction, node.eventType, data, compactionId);
      const next = baseRecord(node, node.eventSeq, [...(previous?.sourceSequences ?? []), node.eventSeq], {
        id: previous?.id ?? `${node.sessionId}:compaction:${compactionId ?? node.eventSeq}`, kind: "compaction", visible: true,
        raw: previous?.raw ?? node.data, summary: content || previous?.summary || "",
        requestId: previous?.requestId ?? pick(asRecord(asRecord(summaryContent).metadata), ["attemptId"]),
        preview: content || previous?.preview || "", outputDetail: content || previous?.outputDetail || null,
        // The transaction commits all events at once, so start→end time is ~0; `compaction/end` records the real work time.
        startedAt: start, completedAt: ended ? node.time : null,
        durationMs: ended ? (typeof data.durationMs === "number" && Number.isFinite(data.durationMs) && data.durationMs >= 0 ? data.durationMs : duration(start, node.time)) : null,
        state: ended ? "completed" : "running", compaction,
      });
      if (index < 0) records.push(next); else records[index] = next;
      continue;
    }
    // Errors, retries, plugin and delegation events stay in rawRecords; request views fold errors and retries.
  }

  let partial: TrajectoryRecord | null = null;
  for (const [messageId, chunkList] of chunks) {
    const first = chunkList[0];
    if (first === undefined) continue;
    const firstData = dataOf(first);
    const context = contexts.get(first.eventSeq) ?? { turnId: pick(firstData, ["turnId", "turn"]), stepId: pick(firstData, ["stepId", "step"]) };
    const stepKey = context.turnId !== null && context.stepId !== null ? `${context.turnId}\u0000${context.stepId}` : null;
    const stepStartAt = pick(firstData, ["stepStartAt", "stepStartTime"])
      ?? requests.get(pick(firstData, ["requestId"]) ?? "")?.header?.time
      ?? (stepKey === null ? null : stepBoundaries.get(stepKey)?.start)
      ?? (context.turnId === null ? null : turnBoundaries.get(context.turnId)?.start)
      ?? first.time;
    const firstNonEmpty = chunkList.find(item => valueText(dataOf(item).delta ?? dataOf(item).content) !== "");
    const ended = context.turnId ? turnBoundaries.get(context.turnId) : undefined;
    // A live group is an empty placeholder here; its content streams in through live.ts.
    const fields = placeholders?.has(messageId)
      ? { ...liveFields(emptyLiveContent()), sourceSequences: [first.eventSeq] }
      : liveFields(appendChunks(emptyLiveContent(), chunkList));
    const raw = baseRecord(first, first.eventSeq, fields.sourceSequences, { id: `${first.sessionId}:record:assistant:${messageId}`, kind: "assistant", visible: true, state: ended?.end ? ended.state : "running", partial: !ended?.end, ...fields, turnId: firstData.turnId ? pick(firstData, ["turnId", "turn"]) : context.turnId, stepId: firstData.stepId ? pick(firstData, ["stepId", "step"]) : context.stepId, startedAt: stepStartAt, completedAt: null, durationMs: null, usage: usage(firstData) });
    partial = { ...raw, assistantMetrics: { ...assistantMetrics(raw, stepStartAt, firstNonEmpty?.time ?? first.time, null), completedAt: null, completedTime: null, generationMs: null, throughputTokensPerSecond: null } };
    records.push(partial);
  }

  const enriched = records.map(record => {
    const direct = record.requestId === null ? null : requests.get(record.requestId);
    const byStep = record.turnId !== null && record.stepId !== null ? requestByStep.get(`${record.turnId}\u0000${record.stepId}`) : undefined;
    const fact = record.requestId === null ? byStep : direct;
    if (fact == null) return record;
    const detail: TrajectoryRequestDetail = {
      requestId: fact.id, provider: fact.provider, model: fact.model, prompt: fact.prompt,
      header: fact.header?.data ?? null,
      context: fact.context?.data ?? null,
      options: fact.options,
      sourceSequences: [...fact.sequences],
      startedAt: fact.header?.time ?? record.startedAt,
      completedAt: record.completedAt,
    };
    return { ...record, requestId: record.requestId ?? fact.id, requestDetail: detail, requestOptions: detail.options, requestContext: detail.context };
  });

  return {
    records: associateCalls(enriched).sort((a, b) => (a.sourceSequences[0] ?? 0) - (b.sourceSequences[0] ?? 0)),
    rawRecords,
    partial,
    requests,
    requestByStep,
    stepBoundaries,
    turnBoundaries,
  };
}

function assignGroups(
  records: readonly TrajectoryRecord[],
  rawRecords: readonly TrajectoryRecord[],
  turnBoundaries: ReadonlyMap<string, TurnBoundary>,
  stepBoundaries: ReadonlyMap<string, Boundary>,
  turnOffset = 0,
): { records: TrajectoryRecord[]; turns: TrajectoryTurn[] } {
  const contexts = buildEventContexts(rawRecords.map(record => ({
    key: `${record.id}`,
    sessionId: "raw",
    eventSeq: record.sourceSequences[0]!,
    eventType: record.eventType,
    time: record.startedAt ?? record.completedAt ?? "",
    kind: record.kind as RuntimeV2TrajectoryNode["kind"],
    state: record.state as RuntimeV2TrajectoryNode["state"],
    callId: record.callId,
    data: record.raw,
  })));
  const turnNumbers = new Map<string, number>();
  const stepNumbers = new Map<string, number>();
  let nextTurn = turnOffset + 1;
  for (const record of [...rawRecords].sort((a, b) => a.sourceSequences[0]! - b.sourceSequences[0]!)) {
    if (record.turnId !== null && !turnNumbers.has(record.turnId)) turnNumbers.set(record.turnId, record.turnNumber ?? nextTurn++);
    if (record.turnId !== null && record.stepId !== null) {
      const key = `${record.turnId}\u0000${record.stepId}`;
      if (!stepNumbers.has(key)) stepNumbers.set(key, [...stepNumbers.keys()].filter(item => item.startsWith(`${record.turnId}\u0000`)).length + 1);
    }
  }
  const assigned = records.map(record => {
    const seq = record.sourceSequences[0];
    const context = seq === undefined ? undefined : contexts.get(seq);
    const turnId = record.systemChange === "initial" ? null : record.turnId ?? context?.turnId ?? null;
    const stepId = record.systemChange === "initial" || record.kind === "user" ? null : record.stepId ?? context?.stepId ?? null;
    const turnNumber = record.turnNumber ?? (turnId === null ? null : turnNumbers.get(turnId) ?? null);
    const stepNumber = record.stepNumber ?? (turnId !== null && stepId !== null ? stepNumbers.get(`${turnId}\u0000${stepId}`) ?? null : null);
    const boundary = turnId !== null && stepId !== null ? stepBoundaries.get(`${turnId}\u0000${stepId}`) : undefined;
    const startedAt = record.kind === "assistant" && record.assistantMetrics?.stepStartAt !== undefined
      ? record.assistantMetrics.stepStartAt
      : record.startedAt ?? boundary?.start ?? null;
    return { ...record, turnId, stepId, turnNumber, stepNumber, startedAt };
  });
  const visibleByTurn = new Map<string, TrajectoryRecord[]>();
  for (const record of assigned) if (record.turnId !== null) visibleByTurn.set(record.turnId, [...(visibleByTurn.get(record.turnId) ?? []), record]);
  const allTurnIds = new Set<string>([...visibleByTurn.keys(), ...turnBoundaries.keys()]);
  const turns = [...allTurnIds].map((id, index) => {
    const visible = visibleByTurn.get(id) ?? [];
    const turnBoundary = turnBoundaries.get(id);
    const stepIds = new Set<string>(visible.map(item => item.stepId).filter((item): item is string => item !== null));
    for (const key of stepBoundaries.keys()) if (key.startsWith(`${id}\u0000`)) stepIds.add(key.slice(id.length + 1));
    const steps = [...stepIds].map((stepId, stepIndex) => {
      const stepRecords = visible.filter(item => item.stepId === stepId);
      const boundary = stepBoundaries.get(`${id}\u0000${stepId}`);
      const failed = stepRecords.some(item => item.state === "failed");
      const running = stepRecords.some(item => item.state === "running" || item.partial);
      return {
        id: stepId,
        number: stepNumbers.get(`${id}\u0000${stepId}`) ?? stepIndex + 1,
        records: stepRecords,
        state: failed ? "failed" : running ? "running" : "completed",
        startedAt: boundary?.start ?? stepRecords.map(item => item.startedAt).find(Boolean) ?? null,
        completedAt: boundary?.end ?? stepRecords.map(item => item.completedAt).filter(Boolean).at(-1) ?? null,
        durationMs: duration(boundary?.start ?? null, boundary?.end ?? null),
      };
    });
    const state = turnBoundary?.state ?? (visible.some(item => item.state === "failed") ? "failed" : visible.some(item => item.state === "running" || item.partial) ? "running" : "completed");
    const startedAt = turnBoundary?.start ?? visible.map(item => item.startedAt).find(Boolean) ?? null;
    const completedAt = turnBoundary?.end ?? visible.map(item => item.completedAt).filter(Boolean).at(-1) ?? null;
    return {
      id,
      number: turnNumbers.get(id) ?? index + 1,
      records: visible,
      rawRecords: rawRecords.filter(item => item.turnId === id),
      steps,
      state,
      startedAt,
      completedAt,
      durationMs: duration(startedAt, completedAt),
      stepCount: steps.length,
      toolCallCount: new Set(visible.map(item => item.callId).filter((item): item is string => item !== null)).size,
    } as TrajectoryTurn;
  }).sort((a, b) => a.number - b.number);
  return { records: assigned, turns };
}

function systemRecords(nodes: readonly RuntimeV2TrajectoryNode[]): TrajectoryRecord[] {
  const output: TrajectoryRecord[] = [];
  let previous: TrajectoryPromptDetail | null = null;
  let previousSignature = "";
  for (const [index, node] of [...nodes].sort((a, b) => a.eventSeq - b.eventSeq).entries()) {
    // 只带请求选项或 promptUnchanged 标记的请求没有提示词正文，不产生系统行。
    const prompt = promptDetail(dataOf(node));
    if (prompt === null || !hasPromptBody(prompt)) continue;
    if (!isPromptChange(node, prompt) && promptSignature(prompt) === previousSignature) continue;
    const kind = changeKind(node, previous, prompt);
    const label = kind === "initial" ? "初始系统提示词" : kind === "tools-updated" ? "工具已更新" : kind === "updated" ? "系统提示词和工具已更新" : "系统提示词已更新";
    output.push(baseRecord(node, index, [node.eventSeq], {
      id: `${node.sessionId}:system:${node.eventSeq}`,
      kind: "system",
      visible: true,
      state: "observed",
      summary: label,
      preview: label,
      systemChange: kind,
      promptDetail: prompt,
      previousPromptDetail: previous,
      startedAt: node.time,
      completedAt: node.time,
      durationMs: 0,
    }));
    previous = prompt;
    previousSignature = promptSignature(prompt);
  }
  return output;
}

/** `placeholders`: live chunk group keys (live.ts) that get an empty placeholder record. */
export function buildTrajectorySnapshot(snapshot: RuntimeV2TrajectorySnapshot, options: { readonly placeholders?: ReadonlySet<string> } = {}): TrajectoryRuntimeSnapshot {
  const merged = mergeNodes(snapshot.nodes, options.placeholders);
  const system = systemRecords(snapshot.nodes);
  const sections = contextSectionRecords(snapshot.nodes, (node, overrides) => baseRecord(node, node.eventSeq, [node.eventSeq], overrides));
  const combined = [...merged.records, ...system, ...sections].sort((a, b) => a.systemChange === "initial" ? -1 : b.systemChange === "initial" ? 1 : (a.sourceSequences[0] ?? 0) - (b.sourceSequences[0] ?? 0));
  const assigned = assignGroups(combined, merged.rawRecords, merged.turnBoundaries, merged.stepBoundaries, snapshot.history?.turnOffset);
  return {
    sessionId: snapshot.sessionId,
    requestOffset: snapshot.history?.requestOffset ?? 0,
    throughJournalSeq: snapshot.throughJournalSeq,
    nodes: snapshot.nodes,
    records: assigned.records.filter(record => record.visible !== false && !record.requestOnly),
    rawRecords: merged.rawRecords,
    turns: assigned.turns,
    partial: merged.partial,
  };
}

/** Merges the facts each compaction event carries: span on `compaction/start`, trigger and tokens on `compaction/end`. */
function compactionFacts(previous: TrajectoryCompactionFacts | undefined, eventType: string, data: Data, compactionId: string | null): TrajectoryCompactionFacts {
  const count = (value: RuntimeV2JsonValue | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const start = count(data.start);
  const end = count(data.end);
  const ended = eventType === "compaction/end";
  return {
    compactionId: previous?.compactionId ?? compactionId,
    trigger: (ended && (data.trigger === "manual" || data.trigger === "auto") ? data.trigger : null) ?? previous?.trigger ?? null,
    messageCount: eventType === "compaction/start" && start !== null && end !== null && end > start ? end - start : previous?.messageCount ?? null,
    beforeTokens: (ended ? count(data.beforeTokens) : null) ?? previous?.beforeTokens ?? null,
    afterTokens: (ended ? count(data.afterTokens) : null) ?? previous?.afterTokens ?? null,
  };
}

export function buildTrajectoryDetail(snapshot: TrajectoryRuntimeSnapshot, recordId: string): TrajectoryDetail | null {
  const record = snapshot.records.find(item => item.id === recordId) ?? snapshot.rawRecords?.find(item => item.id === recordId);
  if (!record) return null;
  const sourceNodes = snapshot.nodes.filter(node => record.sourceSequences.includes(node.eventSeq));
  const sections: { key: string; value: RuntimeV2JsonValue }[] = [
    { key: "raw", value: record.raw },
    { key: "sourceSequences", value: record.sourceSequences as unknown as RuntimeV2JsonValue },
    { key: "timing", value: { startedAt: record.startedAt, completedAt: record.completedAt, durationMs: record.durationMs, assistantMetrics: record.assistantMetrics ?? null, timingSource: record.timingSource ?? null } as unknown as RuntimeV2JsonValue },
  ];
  if (record.usage !== null) sections.push({ key: "usage", value: record.usage as unknown as RuntimeV2JsonValue });
  if (record.requestDetail !== null && record.requestDetail !== undefined) sections.push({ key: "request", value: record.requestDetail as unknown as RuntimeV2JsonValue });
  if (record.inputDetail !== null && record.inputDetail !== undefined) sections.push({ key: "payload", value: record.inputDetail });
  if (record.outputDetail !== null && record.outputDetail !== undefined) sections.push({ key: "result", value: record.outputDetail });
  if (record.schemaDetail !== null && record.schemaDetail !== undefined) sections.push({ key: "schema", value: record.schemaDetail });
  if (record.promptDetail !== null && record.promptDetail !== undefined) sections.push({ key: "prompt", value: record.promptDetail as unknown as RuntimeV2JsonValue });
  return { record, sourceNodes, sections };
}
