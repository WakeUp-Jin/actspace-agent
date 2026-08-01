import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { AgentTraceEvent, AgentTraceSummary, AgentTraceTurnSummary } from "@actspace/shared";

const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|api[-_]?key|secret|password|access[-_]?token|refresh[-_]?token|proxy[-_]?authorization)/i;
const SENSITIVE_QUERY_KEY_PATTERN = /(?:token|signature|key|auth|credential)/i;
const BASE64_PATTERN = /^[a-zA-Z0-9+/=_-]+$/;
const BASE64_REDACTION_THRESHOLD = 1024;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const AGENT_TRACE_MAX_BYTES = 64 * 1024 * 1024;

export type AgentTraceWriteInput = Omit<AgentTraceEvent, "schemaVersion" | "timestamp"> & {
  timestamp?: string;
};

export type AgentTraceWriter = {
  filePath: string;
  summaryFilePath: string;
  write: (event: AgentTraceWriteInput) => Promise<void>;
};

export type AgentTraceWriterInput = {
  sessionDir: string;
  sessionId: string;
  agentRunId: string;
};

/**
 * 为一次 Agent Run 创建稳定的分析 trace。
 *
 * Writer 内部串行化 append，确保并行工具事件也不会打乱已经观察到的事件顺序。
 */
export async function createAgentTraceWriter(input: AgentTraceWriterInput): Promise<AgentTraceWriter> {
  if (!isAbsolute(input.sessionDir)) {
    throw new Error("Agent trace sessionDir must be absolute");
  }
  if (!SAFE_ID_PATTERN.test(input.sessionId) || !SAFE_ID_PATTERN.test(input.agentRunId)) {
    throw new Error("Agent trace IDs must be safe path segments");
  }

  const traceDir = join(input.sessionDir, "traces");
  await mkdir(traceDir, { recursive: true });
  const filePath = getAgentTraceFilePath(input.sessionDir, input.agentRunId);
  const summaryFilePath = getAgentTraceSummaryFilePath(input.sessionDir, input.agentRunId);
  let pendingWrite = Promise.resolve();
  let writtenBytes = 0;
  let summary = createEmptyTraceSummary(input.sessionId, input.agentRunId);
  const llmCallIds = new Set<string>();
  const turnCallIds = new Map<string, Set<string>>();

  const write: AgentTraceWriter["write"] = async (event) => {
    if (event.sessionId !== input.sessionId || event.agentRunId !== input.agentRunId) {
      throw new Error("Agent trace event identity does not match its writer");
    }
    const operation = pendingWrite.then(async () => {
      const normalizedEvent = {
        schemaVersion: 1,
        timestamp: event.timestamp ?? new Date().toISOString(),
        sessionId: event.sessionId,
        agentRunId: event.agentRunId,
        ...(event.turnId ? { turnId: event.turnId } : {}),
        ...(event.turnIndex !== undefined ? { turnIndex: event.turnIndex } : {}),
        ...(event.llmCallId ? { llmCallId: event.llmCallId } : {}),
        ...(event.attempt !== undefined ? { attempt: event.attempt } : {}),
        type: event.type,
        payload: sanitizeTraceValue(event.payload),
      } satisfies AgentTraceEvent;
      summary = updateTraceSummary(summary, normalizedEvent, llmCallIds, turnCallIds);
      const line = `${JSON.stringify(normalizedEvent)}\n`;
      const lineBytes = Buffer.byteLength(line);
      if (!summary.truncated && writtenBytes + lineBytes <= AGENT_TRACE_MAX_BYTES) {
        await writeFile(filePath, line, { flag: "a" });
        writtenBytes += lineBytes;
      } else {
        summary = { ...summary, truncated: true };
      }
      summary = { ...summary, byteSize: writtenBytes };
      await writeTraceSummary(summaryFilePath, summary);
    });

    pendingWrite = operation.catch(() => undefined);
    await operation;
  };

  return { filePath, summaryFilePath, write };
}

export function sanitizeTraceValue(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet<object>());
}

export function getAgentTraceFilePath(sessionDir: string, agentRunId: string): string {
  return join(sessionDir, "traces", `${sanitizeFilePart(agentRunId)}.jsonl`);
}

export function getAgentTraceSummaryFilePath(sessionDir: string, agentRunId: string): string {
  return join(sessionDir, "traces", `${sanitizeFilePart(agentRunId)}.summary.json`);
}

function createEmptyTraceSummary(sessionId: string, agentRunId: string): AgentTraceSummary {
  return {
    schemaVersion: 1,
    toolSummaryVersion: 2,
    sessionId,
    agentRunId,
    startedAt: new Date().toISOString(),
    status: "recording",
    truncated: false,
    turnCount: 0,
    llmCallCount: 0,
    retryCount: 0,
    eventCount: 0,
    toolNames: [],
    modelNames: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 0,
    byteSize: 0,
    turns: [],
  };
}

function updateTraceSummary(
  current: AgentTraceSummary,
  event: AgentTraceEvent,
  llmCallIds: Set<string>,
  turnCallIds: Map<string, Set<string>>,
): AgentTraceSummary {
  let next: AgentTraceSummary = {
    ...current,
    eventCount: current.eventCount + 1,
    startedAt: event.type === "agent_run_start" ? event.timestamp : current.startedAt,
  };

  if (event.type === "agent_run_end") {
    const payload = asRecord(event.payload);
    next = {
      ...next,
      status: payload.status === "failed" ? "failed" : "completed",
      endedAt: event.timestamp,
    };
  }
  if (event.type === "llm_retry") {
    next = { ...next, retryCount: next.retryCount + 1 };
  }

  if (event.turnId && event.turnIndex !== undefined) {
    const turn = next.turns.find((entry) => entry.turnId === event.turnId)
      ?? createTurnSummary(event.turnId, event.turnIndex, event.timestamp);
    const updatedTurn = updateTurnSummary(turn, event, turnCallIds);
    const turns = next.turns.some((entry) => entry.turnId === event.turnId)
      ? next.turns.map((entry) => entry.turnId === event.turnId ? updatedTurn : entry)
      : [...next.turns, updatedTurn];
    next = {
      ...next,
      turns: turns.sort((a, b) => a.turnIndex - b.turnIndex),
      turnCount: turns.length,
    };
  }

  if (event.type === "llm_request") {
    if (event.llmCallId) llmCallIds.add(event.llmCallId);
    const payload = asRecord(event.payload);
    next = {
      ...next,
      llmCallCount: llmCallIds.size,
      modelNames: appendUnique(next.modelNames, readString(payload.model)),
    };
  }

  if (event.type === "llm_response") {
    const payload = asRecord(event.payload);
    const message = asRecord(payload.message);
    const usage = asRecord(message.usage);
    next = {
      ...next,
      modelNames: appendUnique(next.modelNames, readString(message.model)),
      toolNames: appendUniqueMany(next.toolNames, readToolCallNames(message.content)),
      inputTokens: next.inputTokens + readNumber(usage.input),
      outputTokens: next.outputTokens + readNumber(usage.output),
      cacheReadTokens: next.cacheReadTokens + readNumber(usage.cacheRead),
      cacheWriteTokens: next.cacheWriteTokens + readNumber(usage.cacheWrite),
      durationMs: next.durationMs + readNumber(payload.durationMs),
    };
  }

  return next;
}

function createTurnSummary(turnId: string, turnIndex: number, startedAt: string): AgentTraceTurnSummary {
  return {
    turnId,
    turnIndex,
    startedAt,
    llmCallCount: 0,
    retryCount: 0,
    toolNames: [],
    modelNames: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 0,
  };
}

function updateTurnSummary(
  current: AgentTraceTurnSummary,
  event: AgentTraceEvent,
  turnCallIds: Map<string, Set<string>>,
): AgentTraceTurnSummary {
  let next = event.type === "turn_end" ? { ...current, endedAt: event.timestamp } : current;
  if (event.type === "llm_retry") {
    next = { ...next, retryCount: next.retryCount + 1 };
  }
  if (event.type === "llm_request") {
    const calls = turnCallIds.get(current.turnId) ?? new Set<string>();
    if (event.llmCallId) calls.add(event.llmCallId);
    turnCallIds.set(current.turnId, calls);
    const payload = asRecord(event.payload);
    next = {
      ...next,
      llmCallCount: calls.size,
      modelNames: appendUnique(next.modelNames, readString(payload.model)),
    };
  }
  if (event.type === "llm_response") {
    const payload = asRecord(event.payload);
    const message = asRecord(payload.message);
    const usage = asRecord(message.usage);
    next = {
      ...next,
      modelNames: appendUnique(next.modelNames, readString(message.model)),
      toolNames: appendUniqueMany(next.toolNames, readToolCallNames(message.content)),
      inputTokens: next.inputTokens + readNumber(usage.input),
      outputTokens: next.outputTokens + readNumber(usage.output),
      cacheReadTokens: next.cacheReadTokens + readNumber(usage.cacheRead),
      cacheWriteTokens: next.cacheWriteTokens + readNumber(usage.cacheWrite),
      durationMs: next.durationMs + readNumber(payload.durationMs),
    };
  }
  return next;
}

async function writeTraceSummary(filePath: string, summary: AgentTraceSummary): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readToolCallNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => asRecord(entry).type === "toolCall")
    .map((entry) => readString(asRecord(entry).name))
    .filter((entry): entry is string => Boolean(entry));
}

function appendUnique(values: string[], value?: string): string[] {
  return value && !values.includes(value) ? [...values, value] : values;
}

function appendUniqueMany(values: string[], additions: string[]): string[] {
  return additions.reduce((current, value) => appendUnique(current, value), values);
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      ...readSafeErrorFields(value),
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[REDACTED]"
      : sanitizeValue(entry, seen);
  }
  seen.delete(value);
  return sanitized;
}

function sanitizeString(value: string): string {
  if (/^data:/i.test(value)) return "[REDACTED_DATA_URL]";
  if (value.length >= BASE64_REDACTION_THRESHOLD && BASE64_PATTERN.test(value)) {
    return `[REDACTED_BASE64:${value.length}]`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return value;
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
        parsed.searchParams.set(key, "REDACTED");
      }
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function readSafeErrorFields(error: Error): Record<string, unknown> {
  const source = error as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
  return {
    ...(source.code !== undefined ? { code: sanitizeValue(source.code, new WeakSet()) } : {}),
    ...(source.status !== undefined ? { status: sanitizeValue(source.status, new WeakSet()) } : {}),
    ...(source.statusCode !== undefined ? { statusCode: sanitizeValue(source.statusCode, new WeakSet()) } : {}),
  };
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96) || "unknown-agent-run";
}
