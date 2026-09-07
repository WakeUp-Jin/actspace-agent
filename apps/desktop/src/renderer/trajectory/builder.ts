import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type {
  TrajectoryAssistantMetrics,
  TrajectoryDetail,
  TrajectoryPromptDetail,
  TrajectoryRecord,
  TrajectoryRecordKind,
  TrajectoryRecordState,
  TrajectoryRequestDetail,
  TrajectoryRuntimeSnapshot,
  TrajectorySourceBlock,
  TrajectorySystemChangeKind,
  TrajectoryTimeline,
  TrajectoryTimelineMode,
  TrajectoryTimelineSpan,
  TrajectoryTurn,
  TrajectoryUsage,
  TrajectoryVirtualRow,
} from "./contract";

type Data = Readonly<Record<string, RuntimeV2JsonValue>>;
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

const asRecord = (value: RuntimeV2JsonValue | undefined): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const dataOf = (node: RuntimeV2TrajectoryNode): Data => asRecord(node.data);
const text = (value: RuntimeV2JsonValue | undefined): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};
const pick = (data: Data, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = text(data[key]);
    if (value !== null && value !== "") return value;
  }
  return null;
};
const numberValue = (value: RuntimeV2JsonValue | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const json = (value: RuntimeV2JsonValue | undefined, max = 240): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    const result = JSON.stringify(value);
    return result.length > max ? `${result.slice(0, max - 1)}…` : result;
  } catch {
    return "";
  }
};
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

function valueText(value: RuntimeV2JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(item => valueText(item)).filter(Boolean).join("\n\n");
  const data = asRecord(value);
  return pick(data, ["text", "content", "message", "summary", "delta"]) ?? json(value);
}

function sourceBlocks(value: RuntimeV2JsonValue | undefined, fallbackType = "text"): readonly TrajectorySourceBlock[] {
  if (typeof value === "string") return value === "" ? [] : [{ type: fallbackType, content: value, raw: value }];
  if (!Array.isArray(value)) {
    const content = valueText(value);
    return content === "" ? [] : [{ type: fallbackType, content, raw: value }];
  }
  return value.flatMap(item => {
    const data = asRecord(item);
    const type = pick(data, ["type", "kind"]) ?? fallbackType;
    const args = data.arguments ?? data.args ?? data.input;
    const content = type === "tool-call" && args !== undefined ? (typeof args === "string" ? args : JSON.stringify(args)) : valueText(item);
    const callId = pick(data, ["callId", "toolCallId"]);
    const toolName = pick(data, ["name", "toolName"]);
    return [{
      type,
      content,
      ...(callId === null ? {} : { callId }),
      ...(toolName === null ? {} : { toolName }),
      raw: item,
    }];
  });
}

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
  if (type.startsWith("turn/")) return "turn";
  if (type.startsWith("step/")) return "step";
  if (type.startsWith("approval/")) return "approval";
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
    ...(systemPromptParts === undefined ? {} : { systemPromptParts }),
    ...(tools === undefined ? {} : { tools }),
    ...(config === undefined ? {} : { config }),
    raw: direct ?? data,
  };
}

function promptSignature(prompt: TrajectoryPromptDetail | null): string {
  if (prompt === null) return "";
  try { return JSON.stringify(prompt === null ? null : { systemPrompt: prompt.systemPrompt, systemPromptParts: prompt.systemPromptParts, tools: prompt.tools, config: prompt.config }); } catch { return ""; }
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

function changeKind(node: RuntimeV2TrajectoryNode, previous: TrajectoryPromptDetail | null): TrajectorySystemChangeKind {
  const data = dataOf(node);
  const change = asRecord(data.promptChange);
  const explicit = pick(data, ["changeKind", "promptChangeKind"])
    ?? pick(change, ["kind", "changeKind"]);
  if (explicit === "initial") return "initial";
  if (explicit === "tools" || explicit === "tools-updated") return "tools-updated";
  if (explicit === "prompt" || explicit === "prompt-updated" || explicit === "system") return "prompt-updated";
  if (explicit === "system-and-tools" || explicit === "prompt-and-tools") return "updated";
  if (previous === null) return "initial";
  return node.eventType.toLocaleLowerCase().includes("tool") ? "tools-updated" : "updated";
}

function eventRecordId(node: RuntimeV2TrajectoryNode, index: number): string {
  const data = dataOf(node);
  const messageId = pick(data, ["messageId"]);
  const callId = node.callId ?? pick(data, ["callId", "toolCallId"]);
  if (messageId !== null && node.eventType.startsWith("assistant/")) return `${node.sessionId}:record:assistant:${messageId}`;
  if (messageId !== null && node.eventType === "user/message") return `${node.sessionId}:record:user:${messageId}`;
  if (callId !== null && (node.eventType.startsWith("tool/") || node.eventType.startsWith("approval/"))) return `${node.sessionId}:record:tool:${callId}`;
  return `${node.sessionId}:record:${node.eventType}:${node.eventSeq}:${index}`;
}

function summaryFor(node: RuntimeV2TrajectoryNode, result: string | null = null): string {
  const data = dataOf(node);
  if (node.eventType === "assistant/chunk") return "Assistant responding…";
  if (node.eventType === "assistant/message") return valueText(data.content ?? data.message ?? data.summary) || "Assistant message";
  if (node.eventType === "tool/call") {
    const name = pick(data, ["name", "toolName"]) ?? "tool";
    const args = data.arguments ?? data.args ?? data.input ?? data.command ?? data.query ?? data.path;
    return [name, json(args)].filter(Boolean).join(" ");
  }
  if (node.eventType === "tool/result") return result ?? pick(data, ["status", "result", "content", "message", "summary"]) ?? "Tool result";
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
    requestId: pick(data, ["requestId"]) ?? null,
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
    const claimedTurn = node.eventType === "agent/inbox/spliced" && data.operation === "claim" && data.target === "next-turn"
      ? nodes.find(item => item.eventSeq > node.eventSeq && item.eventType === "turn/start") : undefined;
    contexts.set(node.eventSeq, { turnId: explicitTurn ?? (claimedTurn ? pick(dataOf(claimedTurn), ["turnId"]) : activeTurn), stepId: explicitStep ?? activeStep });
    if (node.eventType === "step/end") activeStep = null;
    if (node.eventType === "turn/end") { activeStep = null; activeTurn = null; }
  }
  return contexts;
}

function mergeNodes(nodes: readonly RuntimeV2TrajectoryNode[]): {
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
        fact.prompt = promptDetail(data) ?? fact.prompt;
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
      const messageId = pick(data, ["messageId"]) ?? `${node.sessionId}:partial`;
      chunks.set(messageId, [...(chunks.get(messageId) ?? []), node]);
      continue;
    }
    if (node.eventType === "assistant/message") {
      const messageId = pick(data, ["messageId"]);
      const failedFinal = data.finishReason === "failed" || data.finishReason === "aborted";
      // A thrown provider stream can finalize with a fresh messageId. The exact
      // request identity still ties its observed chunks to that terminal reply.
      const chunkKey = messageId !== null && chunks.has(messageId) ? messageId : failedFinal && requestId !== null
        ? [...chunks].find(([, list]) => pick(dataOf(list[0]!), ["requestId"]) === requestId)?.[0] : undefined;
      const chunkList = chunkKey === undefined ? [] : chunks.get(chunkKey)!;
      const source = [...chunkList.map(item => item.eventSeq), node.eventSeq];
      const raw = baseRecord(node, node.eventSeq, source, { kind: "assistant", visible: true, partial: false, ...(chunkKey ? { id: `${node.sessionId}:record:assistant:${chunkKey}` } : {}) });
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
        || (contentValue == null ? chunkList.map(item => valueText(dataOf(item).delta ?? dataOf(item).content)).join("") : "");
      const enrichedBase: TrajectoryRecord = {
        ...raw,
        turnId: raw.turnId ?? context.turnId,
        stepId: raw.stepId ?? context.stepId,
        startedAt: stepStartAt,
        completedAt: pick(data, ["completedAt", "finishedAt"]) ?? node.time,
        durationMs: duration(stepStartAt, pick(data, ["completedAt", "finishedAt"]) ?? node.time),
        summary: content || thinkingBlocks.map(block => block.content).join(" ") || (allBlocks.some(block => block.type === "tool-call") ? "Calling tools…" : raw.state === "failed" ? "Assistant request failed" : raw.state === "aborted" ? "Assistant request aborted" : "Assistant message"),
        preview: content || valueText(thinkingValue) || "Assistant message",
        inputDetail: data.input ?? data.prompt ?? null,
        outputDetail: contentValue ?? (content === "" ? null : content),
        thinkingDetail: thinkingBlocks.map(block => block.content).join("\n\n") || separateThinking || null,
        sourceBlocks: allBlocks.length ? allBlocks : sourceBlocks(content),
        usage: usage(data),
      };
      records.push({ ...enrichedBase, assistantMetrics: assistantMetrics(enrichedBase, stepStartAt, firstTokenAt, enrichedBase.completedAt) });
      if (chunkKey !== undefined) chunks.delete(chunkKey);
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
    if (node.eventType.startsWith("approval/") && node.callId !== null) {
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
    if (kind === "user") {
      const content = data.content ?? data.message ?? surfaceNode.content ?? null;
      const context = contexts.get(node.eventSeq);
      records.push(baseRecord(node, node.eventSeq, [node.eventSeq], {
        id: `${node.sessionId}:record:user:${pick(data, ["messageId"]) ?? node.eventSeq}`,
        visible: true, turnId: context?.turnId ?? null, stepId: null,
        summary: valueText(content) || "User message", preview: valueText(content),
        inputDetail: content, outputDetail: null, messageSource: data.source ?? node.source ?? null,
        durationMs: 0, sourceBlocks: sourceBlocks(content),
      }));
      continue;
    }
    if (node.eventType.startsWith("compaction/") || (node.eventType === "surface/replaced" && data.compactionId)) {
      const compactionId = pick(data, ["compactionId"]);
      const index = compactionId ? records.findIndex(record => record.kind === "compaction" && pick(asRecord(record.raw), ["compactionId"]) === compactionId) : -1;
      const previous = index < 0 ? undefined : records[index];
      const content = valueText(data.summary ?? data.content ?? surfaceNode.content);
      const ended = node.eventType === "compaction/end" || node.eventType === "compaction/completed";
      const start = previous?.startedAt ?? node.time;
      const next = baseRecord(node, node.eventSeq, [...(previous?.sourceSequences ?? []), node.eventSeq], {
        id: previous?.id ?? `${node.sessionId}:compaction:${compactionId ?? node.eventSeq}`, kind: "compaction", visible: true,
        raw: previous?.raw ?? node.data, summary: content || previous?.summary || "Context compaction",
        preview: content || previous?.preview || "Context compaction", outputDetail: content || previous?.outputDetail || null,
        startedAt: start, completedAt: ended ? node.time : null, durationMs: ended ? duration(start, node.time) : null,
        state: ended ? "completed" : "running",
      });
      if (index < 0) records.push(next); else records[index] = next;
      continue;
    }
    // Lifecycle facts are retained in rawRecords, never disguised as SYSTEM messages.
    const hiddenMetadata = /^(session|turn|step|request|agent|tool-workflow|surface|recovery|runtime)\//.test(node.eventType);
    if (kind === "error" || (kind === "raw" && !hiddenMetadata)) records.push(baseRecord(node, node.eventSeq, [node.eventSeq], { visible: true }));
  }

  let partial: TrajectoryRecord | null = null;
  for (const [messageId, chunkList] of chunks) {
    const first = chunkList[0];
    const last = chunkList.at(-1);
    if (first === undefined || last === undefined) continue;
    const firstData = dataOf(first);
    const context = contexts.get(first.eventSeq) ?? { turnId: pick(firstData, ["turnId", "turn"]), stepId: pick(firstData, ["stepId", "step"]) };
    const stepKey = context.turnId !== null && context.stepId !== null ? `${context.turnId}\u0000${context.stepId}` : null;
    const stepStartAt = pick(firstData, ["stepStartAt", "stepStartTime"])
      ?? requests.get(pick(firstData, ["requestId"]) ?? "")?.header?.time
      ?? (stepKey === null ? null : stepBoundaries.get(stepKey)?.start)
      ?? (context.turnId === null ? null : turnBoundaries.get(context.turnId)?.start)
      ?? first.time;
    const firstNonEmpty = chunkList.find(item => valueText(dataOf(item).delta ?? dataOf(item).content) !== "");
    const joined = chunkList.filter(item => dataOf(item).kind !== "reasoning-delta").map(item => valueText(dataOf(item).delta ?? dataOf(item).content)).join("");
    const thinking = chunkList.filter(item => dataOf(item).kind === "reasoning-delta").map(item => valueText(dataOf(item).content)).join("");
    const ended = context.turnId ? turnBoundaries.get(context.turnId) : undefined;
    const raw = baseRecord(first, first.eventSeq, chunkList.map(item => item.eventSeq), { id: `${first.sessionId}:record:assistant:${messageId}`, kind: "assistant", visible: true, state: ended?.end ? ended.state : "running", partial: !ended?.end, summary: joined || "Assistant responding…", preview: joined || "Assistant responding…", raw: { chunks: chunkList.map(item => item.data) }, turnId: firstData.turnId ? pick(firstData, ["turnId", "turn"]) : context.turnId, stepId: firstData.stepId ? pick(firstData, ["stepId", "step"]) : context.stepId, startedAt: stepStartAt, completedAt: null, durationMs: null, outputDetail: joined || null, sourceBlocks: [...sourceBlocks(thinking, "reasoning"), ...sourceBlocks(joined)], thinkingDetail: thinking || null, usage: usage(firstData) });
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
    const prompt = promptDetail(dataOf(node));
    const changed = isPromptChange(node, prompt) || (prompt !== null && promptSignature(prompt) !== previousSignature);
    if (!changed || prompt === null) continue;
    const kind = changeKind(node, previous);
    const label = kind === "initial" ? "Initial System Prompt" : kind === "tools-updated" ? "Tools Updated" : "System Prompt Updated";
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

function lane(record: TrajectoryRecord): 0 | 1 | 2 {
  if (record.kind === "tool" || record.kind === "approval") return 2;
  if (record.kind === "assistant") return 1;
  return 0;
}

function timeline(records: readonly TrajectoryRecord[], mode: TrajectoryTimelineMode): TrajectoryTimeline | null {
  const visible = records.filter(record => record.visible !== false && !record.requestOnly);
  const spans: TrajectoryTimelineSpan[] = visible.flatMap((record, recordIndex) => {
    const recordedStart = parseTime(record.startedAt);
    if (mode !== "sequence" && recordedStart === null) return [];
    const start = mode === "sequence" ? recordIndex : recordedStart!;
    return [{ recordId: record.id, recordIndex, start,
      end: start + (mode === "sequence" ? 1 : mode === "time" ? 0 : Math.max(0, record.durationMs ?? 0)),
      lane: lane(record), kind: record.kind, state: record.state }];
  });
  if (spans.length === 0) return null;
  // Remove only uncovered idle intervals; overlapping model/tool work stays aligned.
  if (mode === "duration") {
    let coveredUntil: number | null = null;
    let removedIdle = 0;
    for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
      const originalEnd = span.end;
      if (coveredUntil !== null && span.start > coveredUntil) removedIdle += span.start - coveredUntil;
      coveredUntil = Math.max(coveredUntil ?? originalEnd, originalEnd);
      Object.assign(span, { start: span.start - removedIdle, end: originalEnd - removedIdle });
    }
  }
  const seenTurns = new Set<number>();
  const turnBoundaries = spans.flatMap(span => {
    const number = visible[span.recordIndex]!.turnNumber;
    if (number === null || seenTurns.has(number)) return [];
    seenTurns.add(number);
    return [{ turnNumber: number, time: span.start }];
  });
  return { mode, start: Math.min(...spans.map(span => span.start)), end: Math.max(...spans.map(span => span.end)), spans, turnBoundaries };
}

function rowEntry(records: readonly TrajectoryRecord[], record: TrajectoryRecord): { logicalIndex: number; record: TrajectoryRecord } {
  return { logicalIndex: Math.max(0, records.indexOf(record)), record };
}

export function groupVirtualRows(
  records: readonly TrajectoryRecord[],
  collapsedTurnIds: ReadonlySet<string> = new Set(),
  collapsedCallIds: ReadonlySet<string> = new Set(),
): readonly TrajectoryVirtualRow[] {
  const visible = records.filter(record => record.visible !== false && !record.requestOnly);
  const rows: TrajectoryVirtualRow[] = [];
  const turnStats = new Map<string, { steps: Set<string>; calls: Set<string> }>();
  for (const record of visible) {
    if (record.turnId === null) continue;
    const stats = turnStats.get(record.turnId) ?? { steps: new Set(), calls: new Set() };
    if (record.stepId !== null) stats.steps.add(record.stepId);
    if (record.callId !== null) stats.calls.add(record.callId);
    turnStats.set(record.turnId, stats);
  }
  let index = 0;
  while (index < visible.length) {
    const record = visible[index]!;
    if (record.turnId !== null && collapsedTurnIds.has(record.turnId)) {
      let end = index + 1;
      while (end < visible.length && visible[end]!.turnId === record.turnId) end += 1;
      if (end - index > 1) {
        rows.push({ key: record.id, entries: [rowEntry(records, record)], height: 36, rowType: "record" });
        const stats = turnStats.get(record.turnId);
        rows.push({ key: `${record.turnId}:turn-summary`, entries: visible.slice(index + 1, end).map(item => rowEntry(records, item)), height: 30, rowType: "turn-summary", summary: `… ${stats?.steps.size ?? 0} step${stats?.steps.size === 1 ? "" : "s"} · ${stats?.calls.size ?? 0} tool call${stats?.calls.size === 1 ? "" : "s"}` });
        const partials = visible.slice(index + 1, end).filter(item => item.partial);
        for (const partial of partials) rows.push({ key: partial.id, entries: [rowEntry(records, partial)], height: 36, rowType: "record" });
        index = end;
        continue;
      }
    }
    if (record.kind === "assistant") {
      let end = index + 1;
      while (end < visible.length && visible[end]!.kind === "tool" && visible[end]!.turnId === record.turnId) end += 1;
      const tools = visible.slice(index + 1, end);
      if (tools.length > 0 && tools.some(tool => tool.callId !== null && collapsedCallIds.has(tool.callId))) {
        rows.push({ key: record.id, entries: [rowEntry(records, record)], height: 36, rowType: "record" });
        const names = [...new Set(tools.map(tool => tool.toolName ?? tool.summary.split(" ")[0] ?? "tool"))];
        rows.push({ key: `${record.id}:call-summary`, entries: tools.map(tool => rowEntry(records, tool)), height: 28, rowType: "call-summary", summary: `… ${tools.length} tool call${tools.length === 1 ? "" : "s"} · ${names.join(", ")}` });
        index = end;
        continue;
      }
    }
    if (record.kind === "tool" && record.callId !== null && collapsedCallIds.has(record.callId)) {
      let end = index + 1;
      while (end < visible.length && visible[end]!.kind === "tool" && visible[end]!.callId !== null && collapsedCallIds.has(visible[end]!.callId)) end += 1;
      rows.push({ key: `${record.callId}:call-summary`, entries: visible.slice(index, end).map(tool => rowEntry(records, tool)), height: 28, rowType: "call-summary", summary: `… ${end - index} tool call${end - index === 1 ? "" : "s"}` });
      index = end;
      continue;
    }
    rows.push({ key: record.id, entries: [rowEntry(records, record)], height: 36, rowType: "record" });
    index += 1;
  }
  return rows;
}

export function buildTrajectorySnapshot(snapshot: RuntimeV2TrajectorySnapshot, mode: TrajectoryTimelineMode = "sequence"): TrajectoryRuntimeSnapshot {
  const merged = mergeNodes(snapshot.nodes);
  const system = systemRecords(snapshot.nodes).map(record => snapshot.history?.fromSeq && record.systemChange === "initial" ? { ...record, summary: "System Prompt at History Boundary", preview: "System Prompt at History Boundary" } : record);
  const combined = [...merged.records, ...system].sort((a, b) => a.systemChange === "initial" ? -1 : b.systemChange === "initial" ? 1 : (a.sourceSequences[0] ?? 0) - (b.sourceSequences[0] ?? 0));
  const assigned = assignGroups(combined, merged.rawRecords, merged.turnBoundaries, merged.stepBoundaries, snapshot.history?.turnOffset);
  const searchIndex = new Map<string, string>();
  for (const record of assigned.records) {
    searchIndex.set(record.id, JSON.stringify({ eventType: record.eventType, kind: record.kind, state: record.state, summary: record.summary, preview: record.preview, result: record.result, raw: record.raw, request: record.requestDetail, schema: record.schemaDetail, input: record.inputDetail, output: record.outputDetail, sourceBlocks: record.sourceBlocks }).toLocaleLowerCase());
  }
  return {
    sessionId: snapshot.sessionId,
    requestOffset: snapshot.history?.requestOffset ?? 0,
    throughJournalSeq: snapshot.throughJournalSeq,
    nodes: snapshot.nodes,
    records: assigned.records.filter(record => record.visible !== false && !record.requestOnly),
    rawRecords: merged.rawRecords,
    turns: assigned.turns,
    timeline: timeline(assigned.records, mode),
    searchIndex,
    virtualRows: groupVirtualRows(assigned.records),
    partial: merged.partial,
  };
}

export function searchTrajectory(snapshot: TrajectoryRuntimeSnapshot, query: string): ReadonlySet<string> | null {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  const result = new Set<string>();
  for (const [id, value] of snapshot.searchIndex) if (terms.every(term => value.includes(term))) result.add(id);
  return result;
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
