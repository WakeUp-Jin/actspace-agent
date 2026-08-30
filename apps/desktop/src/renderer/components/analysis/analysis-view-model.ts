import type { AgentTraceEvent, AgentTraceSummary } from "@actspace/shared";

export type AnalysisToolView = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AnalysisMessageView = {
  role: "user" | "assistant" | "toolResult" | "system" | "unknown";
  label: string;
  toolName?: string;
  content: unknown;
};

export type AnalysisCallView = {
  llmCallId: string;
  attempt: number;
  timestamp: string;
  turnId: string;
  turnIndex: number;
  status: "recording" | "completed" | "failed" | "retried";
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: unknown;
  provider?: string;
  model?: string;
  tools: AnalysisToolView[];
  messages: AnalysisMessageView[];
  systemPrompt: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  durationMs: number;
  stopReason?: string;
};

export type AnalysisTurnView = {
  turnId: string;
  turnIndex: number;
  startedAt: string;
  calls: AnalysisCallView[];
};

export type AnalysisRunDetail = {
  trace: AgentTraceSummary;
  turns: AnalysisTurnView[];
  calls: AnalysisCallView[];
};

export type AnalysisRequestDiff = {
  unchangedMessageCount: number;
  addedMessages: AnalysisMessageView[];
  removedMessages: AnalysisMessageView[];
  systemPromptChanged: boolean;
  previousSystemPrompt: string;
  currentSystemPrompt: string;
  toolsChanged: boolean;
  previousTools: string[];
  currentTools: string[];
  modelChanged: boolean;
  previousModel?: string;
  currentModel?: string;
  requestContextUnchanged: boolean;
};

export function buildAnalysisRunDetail(
  trace: AgentTraceSummary,
  events: AgentTraceEvent[],
): AnalysisRunDetail {
  const turnStartedAt = new Map<string, string>();
  const turns = new Map<string, AnalysisTurnView>();
  const calls = new Map<string, AnalysisCallView>();
  let runError: unknown;

  for (const event of events) {
    if (event.type === "turn_start" && event.turnId && event.turnIndex !== undefined) {
      turnStartedAt.set(event.turnId, event.timestamp);
      turns.set(event.turnId, {
        turnId: event.turnId,
        turnIndex: event.turnIndex,
        startedAt: event.timestamp,
        calls: [],
      });
      continue;
    }

    if (event.type === "llm_request" && event.turnId && event.turnIndex !== undefined && event.llmCallId) {
      const request = asRecord(event.payload);
      const call: AnalysisCallView = {
        llmCallId: event.llmCallId,
        attempt: event.attempt ?? 1,
        timestamp: event.timestamp,
        turnId: event.turnId,
        turnIndex: event.turnIndex,
        status: "recording",
        request,
        provider: readString(request.provider),
        model: readString(request.model),
        tools: readTools(request.tools),
        messages: readMessages(request.messages),
        systemPrompt: readSystemPrompt(request),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        durationMs: 0,
      };
      calls.set(event.llmCallId, call);
      const turn = turns.get(event.turnId) ?? {
        turnId: event.turnId,
        turnIndex: event.turnIndex,
        startedAt: turnStartedAt.get(event.turnId) ?? event.timestamp,
        calls: [],
      };
      turn.calls.push(call);
      turns.set(event.turnId, turn);
      continue;
    }

    if (event.type === "llm_response" && event.llmCallId) {
      const call = calls.get(event.llmCallId);
      if (!call) continue;
      const response = asRecord(event.payload);
      const message = asRecord(response.message);
      const usage = asRecord(message.usage);
      const stopReason = readString(response.stopReason) ?? readString(message.stopReason);
      call.response = response;
      call.provider = readString(message.provider) ?? call.provider;
      call.model = readString(message.model) ?? call.model;
      call.usage = {
        input: readNumber(usage.input),
        output: readNumber(usage.output),
        cacheRead: readNumber(usage.cacheRead),
        cacheWrite: readNumber(usage.cacheWrite),
      };
      call.durationMs = readNumber(response.durationMs);
      call.stopReason = stopReason;
      call.status = stopReason === "error" || stopReason === "aborted" ? "failed" : "completed";
      continue;
    }

    if (event.type === "llm_retry" && event.llmCallId) {
      const call = calls.get(event.llmCallId);
      if (call) call.status = "retried";
      continue;
    }

    if (event.type === "agent_run_end" && asRecord(event.payload).status === "failed") {
      runError = asRecord(event.payload).error;
    }
  }

  const orderedTurns = [...turns.values()]
    .map((turn) => ({ ...turn, calls: [...turn.calls].sort(compareCalls) }))
    .sort((a, b) => a.turnIndex - b.turnIndex);
  if (trace.status === "failed") {
    const lastCall = orderedTurns.at(-1)?.calls.at(-1);
    if (lastCall && lastCall.status === "recording") lastCall.status = "failed";
    if (lastCall && runError !== undefined) lastCall.error = runError;
  }
  return {
    trace,
    turns: orderedTurns,
    calls: orderedTurns.flatMap((turn) => turn.calls),
  };
}

export function diffAnalysisRequests(
  previous: AnalysisCallView,
  current: AnalysisCallView,
): AnalysisRequestDiff {
  let unchangedMessageCount = 0;
  const maxPrefix = Math.min(previous.messages.length, current.messages.length);
  while (
    unchangedMessageCount < maxPrefix
    && stableStringify(previous.messages[unchangedMessageCount]) === stableStringify(current.messages[unchangedMessageCount])
  ) {
    unchangedMessageCount += 1;
  }
  const previousTools = previous.tools.map((tool) => tool.name);
  const currentTools = current.tools.map((tool) => tool.name);
  const systemPromptChanged = previous.systemPrompt !== current.systemPrompt;
  const toolsChanged = stableStringify(previous.tools) !== stableStringify(current.tools);
  const modelChanged = previous.model !== current.model;
  const addedMessages = current.messages.slice(unchangedMessageCount);
  const removedMessages = previous.messages.slice(unchangedMessageCount);
  return {
    unchangedMessageCount,
    addedMessages,
    removedMessages,
    systemPromptChanged,
    previousSystemPrompt: previous.systemPrompt,
    currentSystemPrompt: current.systemPrompt,
    toolsChanged,
    previousTools,
    currentTools,
    modelChanged,
    previousModel: previous.model,
    currentModel: current.model,
    requestContextUnchanged: !systemPromptChanged
      && !toolsChanged
      && !modelChanged
      && addedMessages.length === 0
      && removedMessages.length === 0,
  };
}

export function createSanitizedCurl(call: AnalysisCallView): string {
  const body = JSON.stringify(call.request, null, 2).replaceAll("'", "'\\''");
  return [
    "curl '${BASE_URL}/chat/completions' \\",
    "  -H 'Authorization: Bearer ${API_KEY}' \\",
    "  -H 'Content-Type: application/json' \\",
    `  --data '${body}'`,
  ].join("\n");
}

export function messageText(message: AnalysisMessageView): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((entry) => {
      const block = asRecord(entry);
      return readString(block.text)
        ?? readString(block.thinking)
        ?? (block.type === "toolCall" ? JSON.stringify(block.arguments ?? {}, null, 2) : JSON.stringify(entry, null, 2));
    }).join("\n\n");
  }
  return JSON.stringify(message.content, null, 2);
}

export function responseContent(call: AnalysisCallView): unknown[] {
  const message = asRecord(call.response?.message);
  return Array.isArray(message.content) ? message.content : [];
}

function readTools(value: unknown): AnalysisToolView[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const tool = asRecord(entry);
    return {
      name: readString(tool.name) ?? "unknown_tool",
      description: readString(tool.description) ?? "暂无说明",
      parameters: asRecord(tool.parameters ?? tool.inputSchema ?? tool.input_schema),
    };
  });
}

function readMessages(value: unknown): AnalysisMessageView[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const message = asRecord(entry);
    const role = readString(message.role);
    if (role === "user") return { role, label: "USER", content: message.content };
    if (role === "assistant") return { role, label: "ASSISTANT", content: message.content };
    if (role === "toolResult") {
      return {
        role,
        label: "TOOL RESULT",
        toolName: readString(message.toolName),
        content: message.content,
      };
    }
    if (role === "system") return { role, label: "SYSTEM", content: message.content };
    return { role: "unknown", label: role?.toUpperCase() ?? "MESSAGE", content: message.content ?? entry };
  });
}

function readSystemPrompt(request: Record<string, unknown>): string {
  const direct = readString(request.systemPrompt);
  if (direct) return direct;
  if (!Array.isArray(request.systemPromptParts)) return "";
  return request.systemPromptParts.map((entry) => readString(asRecord(entry).content) ?? "").filter(Boolean).join("\n\n");
}

function compareCalls(a: AnalysisCallView, b: AnalysisCallView): number {
  return a.attempt - b.attempt || a.timestamp.localeCompare(b.timestamp);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["id", "timestamp", "responseId", "llmCallId", "turnId"].includes(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortValue(entry)]),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
