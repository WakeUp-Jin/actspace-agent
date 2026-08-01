import { lstat, readFile, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentAnalysisIndexInput,
  AgentAnalysisIndexResult,
  AgentAnalysisTotals,
  AgentTraceClearInput,
  AgentTraceClearResult,
  AgentTraceEvent,
  AgentTraceListInput,
  AgentTraceListResult,
  AgentTraceReadInput,
  AgentTraceReadResult,
  AgentTraceSummary,
  AgentTraceTurnSummary,
  SessionEvent,
  UserMessagePayload,
} from "@actspace/shared";
import {
  AGENT_TRACE_MAX_BYTES,
  createSessionStorePaths,
  getAgentTraceFilePath,
  getAgentTraceSummaryFilePath,
  readSessionRecord,
} from "@actspace/agent-core";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_TRACE_EVENTS = 100_000;
export const AGENT_TRACE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const AGENT_TRACE_TOTAL_MAX_BYTES = 512 * 1024 * 1024;

export async function listAgentTraces(
  sessionRoot: string,
  input: AgentTraceListInput,
): Promise<AgentTraceListResult> {
  assertSafeId("sessionId", input.sessionId);
  const sessionDir = join(sessionRoot, input.sessionId);
  const traceDir = join(sessionDir, "traces");
  const entries = await readdir(traceDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const summaryRunIds = new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".summary.json"))
      .map((entry) => entry.name.slice(0, -".summary.json".length)),
  );
  const runIds = new Set(summaryRunIds);
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      runIds.add(entry.name.slice(0, -".jsonl".length));
    }
  }

  const summaries = await Promise.all(
    [...runIds].map((agentRunId) => readSummaryWithTraceFallback(sessionDir, input.sessionId, agentRunId)),
  );
  const traces = summaries.filter((entry): entry is AgentTraceSummary => Boolean(entry));
  traces.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return { traces };
}

export async function readAgentTrace(
  sessionRoot: string,
  input: AgentTraceReadInput,
): Promise<AgentTraceReadResult> {
  assertSafeId("sessionId", input.sessionId);
  assertSafeId("agentRunId", input.agentRunId);
  const sessionDir = join(sessionRoot, input.sessionId);
  const filePath = getAgentTraceFilePath(sessionDir, input.agentRunId);
  const events = await readTraceFile(filePath);
  const sidecar = await readTraceSummary(sessionDir, input.sessionId, input.agentRunId).catch(() => null);
  const trace = sidecar ?? summarizeTrace(events, (await lstat(filePath)).size);
  if (trace.sessionId !== input.sessionId || trace.agentRunId !== input.agentRunId) {
    throw new Error("Agent trace identity does not match the requested session and run");
  }
  return { trace, events };
}

export async function getAgentAnalysisIndex(
  sessionRoot: string,
  input: AgentAnalysisIndexInput,
): Promise<AgentAnalysisIndexResult> {
  assertSafeId("sessionId", input.sessionId);
  const record = await readSessionRecord(createSessionStorePaths(join(sessionRoot, input.sessionId)));
  if (!record) throw new Error(`Session not found: ${input.sessionId}`);
  const { traces } = await listAgentTraces(sessionRoot, input);
  const userMessages = collectUserMessages(record.events);
  const runs = traces.map((trace) => ({
    ...trace,
    userMessagePreview: userMessages.get(trace.agentRunId) ?? "未记录用户输入",
  }));
  const totals = runs.reduce<AgentAnalysisTotals>((current, run) => ({
    agentRunCount: current.agentRunCount + 1,
    turnCount: current.turnCount + run.turnCount,
    llmCallCount: current.llmCallCount + run.llmCallCount,
    inputTokens: current.inputTokens + run.inputTokens,
    outputTokens: current.outputTokens + run.outputTokens,
    cacheReadTokens: current.cacheReadTokens + run.cacheReadTokens,
    cacheWriteTokens: current.cacheWriteTokens + run.cacheWriteTokens,
    durationMs: current.durationMs + run.durationMs,
  }), emptyAnalysisTotals());
  const toolNames = uniqueStrings(runs.flatMap((run) => run.toolNames));
  return {
    sessionId: input.sessionId,
    title: record.meta.title,
    totals,
    toolNames,
    runs,
  };
}

export async function clearAgentTraces(
  sessionRoot: string,
  input: AgentTraceClearInput,
): Promise<AgentTraceClearResult> {
  if (input.scope === "session") {
    assertSafeId("sessionId", input.sessionId);
    return removeTraceDirectory(join(sessionRoot, input.sessionId, "traces"));
  }

  const entries = await readdir(sessionRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let filesDeleted = 0;
  let bytesFreed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !SAFE_ID_PATTERN.test(entry.name)) continue;
    const result = await removeTraceDirectory(join(sessionRoot, entry.name, "traces"));
    filesDeleted += result.filesDeleted;
    bytesFreed += result.bytesFreed;
  }
  return { filesDeleted, bytesFreed };
}

export async function enforceAgentTraceRetention(
  sessionRoot: string,
  now = Date.now(),
): Promise<AgentTraceClearResult> {
  const candidates: Array<{
    sessionDir: string;
    summary: AgentTraceSummary;
    bytes: number;
  }> = [];
  let totalBytes = 0;
  const sessionEntries = await readdir(sessionRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  for (const sessionEntry of sessionEntries) {
    if (!sessionEntry.isDirectory() || !SAFE_ID_PATTERN.test(sessionEntry.name)) continue;
    const sessionDir = join(sessionRoot, sessionEntry.name);
    const traceDir = join(sessionDir, "traces");
    const entries = await readdir(traceDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stats = await lstat(join(traceDir, entry.name));
      if (!stats.isSymbolicLink() && stats.isFile()) totalBytes += stats.size;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".summary.json")) continue;
      const agentRunId = entry.name.slice(0, -".summary.json".length);
      const summary = await readTraceSummary(sessionDir, sessionEntry.name, agentRunId).catch(() => null);
      if (!summary || summary.status === "recording") continue;
      candidates.push({
        sessionDir,
        summary,
        bytes: await measureRunTraceBytes(sessionDir, agentRunId),
      });
    }
  }

  candidates.sort((a, b) => a.summary.startedAt.localeCompare(b.summary.startedAt));
  let filesDeleted = 0;
  let bytesFreed = 0;
  const deletedRuns = new Set<string>();
  for (const candidate of candidates) {
    const endedAt = candidate.summary.endedAt ? Date.parse(candidate.summary.endedAt) : Date.parse(candidate.summary.startedAt);
    if (!Number.isFinite(endedAt) || now - endedAt <= AGENT_TRACE_RETENTION_MS) continue;
    const result = await removeRunTraceFiles(candidate.sessionDir, candidate.summary.agentRunId);
    deletedRuns.add(`${candidate.summary.sessionId}:${candidate.summary.agentRunId}`);
    filesDeleted += result.filesDeleted;
    bytesFreed += result.bytesFreed;
    totalBytes -= result.bytesFreed;
  }

  for (const candidate of candidates) {
    if (totalBytes <= AGENT_TRACE_TOTAL_MAX_BYTES) break;
    if (deletedRuns.has(`${candidate.summary.sessionId}:${candidate.summary.agentRunId}`)) continue;
    const result = await removeRunTraceFiles(candidate.sessionDir, candidate.summary.agentRunId);
    filesDeleted += result.filesDeleted;
    bytesFreed += result.bytesFreed;
    totalBytes -= result.bytesFreed;
  }
  return { filesDeleted, bytesFreed };
}

function assertSafeId(label: string, value: string): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

async function readSummaryWithTraceFallback(
  sessionDir: string,
  sessionId: string,
  agentRunId: string,
): Promise<AgentTraceSummary | null> {
  try {
    const summary = await readTraceSummary(sessionDir, sessionId, agentRunId);
    if (summary) return summary;
  } catch {
    // 单个 sidecar 损坏不能阻断同一 Session 的其他 Agent Run。
  }

  try {
    const filePath = getAgentTraceFilePath(sessionDir, agentRunId);
    const events = await readTraceFile(filePath);
    return summarizeTrace(events, (await lstat(filePath)).size);
  } catch {
    // JSONL 也不可读时只跳过该 Run，聊天历史与其他 Trace 仍可继续使用。
    return null;
  }
}

async function readTraceFile(filePath: string): Promise<AgentTraceEvent[]> {
  const stats = await lstat(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("Agent trace path must be a regular file");
  }
  if (stats.size > AGENT_TRACE_MAX_BYTES) {
    throw new Error(`Agent trace exceeds the ${AGENT_TRACE_MAX_BYTES} byte read limit`);
  }

  const raw = await readFile(filePath, "utf8");
  const lines = raw.split("\n");
  const events: AgentTraceEvent[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (events.length >= MAX_TRACE_EVENTS) {
      throw new Error(`Agent trace exceeds the ${MAX_TRACE_EVENTS} event read limit`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const isTrailingPartialLine = index === lines.length - 1 && !raw.endsWith("\n");
      if (isTrailingPartialLine) break;
      throw new Error(`Invalid agent trace JSON at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isAgentTraceEvent(parsed)) {
      throw new Error(`Invalid agent trace event at line ${index + 1}`);
    }
    events.push(parsed);
  }
  return events;
}

async function readTraceSummary(
  sessionDir: string,
  sessionId: string,
  agentRunId: string,
): Promise<AgentTraceSummary | null> {
  assertSafeId("agentRunId", agentRunId);
  const filePath = getAgentTraceSummaryFilePath(sessionDir, agentRunId);
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("Agent trace summary path must be a regular file");
    }
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!isAgentTraceSummary(parsed)) throw new Error("Invalid agent trace summary");
    if (parsed.sessionId !== sessionId || parsed.agentRunId !== agentRunId) {
      throw new Error("Agent trace summary identity does not match its file");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isAgentTraceEvent(value: unknown): value is AgentTraceEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AgentTraceEvent>;
  return (
    event.schemaVersion === 1
    && typeof event.timestamp === "string"
    && typeof event.sessionId === "string"
    && typeof event.agentRunId === "string"
    && typeof event.type === "string"
    && "payload" in event
  );
}

function isAgentTraceSummary(value: unknown): value is AgentTraceSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<AgentTraceSummary>;
  return summary.schemaVersion === 1
    && typeof summary.sessionId === "string"
    && typeof summary.agentRunId === "string"
    && typeof summary.startedAt === "string"
    && (summary.status === "recording" || summary.status === "completed" || summary.status === "failed")
    && typeof summary.truncated === "boolean"
    && typeof summary.turnCount === "number"
    && typeof summary.llmCallCount === "number"
    && Array.isArray(summary.turns);
}

function summarizeTrace(events: AgentTraceEvent[], byteSize: number): AgentTraceSummary {
  const first = events[0];
  if (!first) throw new Error("Agent trace is empty");
  const turns = new Map<string, AgentTraceTurnSummary>();
  const callIds = new Set<string>();
  const turnCallIds = new Map<string, Set<string>>();
  const toolNames: string[] = [];
  const modelNames: string[] = [];
  let retryCount = 0;
  let endedAt: string | undefined;
  let status: AgentTraceSummary["status"] = "recording";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let durationMs = 0;

  for (const event of events) {
    if (event.sessionId !== first.sessionId || event.agentRunId !== first.agentRunId) {
      throw new Error("Agent trace contains mixed identities");
    }
    if (event.type === "agent_run_end") {
      endedAt = event.timestamp;
      status = asRecord(event.payload).status === "failed" ? "failed" : "completed";
    }
    if (event.type === "llm_retry") retryCount += 1;
    if (event.type === "llm_request" && event.llmCallId) callIds.add(event.llmCallId);

    if (event.turnId && event.turnIndex !== undefined) {
      const current = turns.get(event.turnId) ?? emptyTurn(event.turnId, event.turnIndex, event.timestamp);
      turns.set(event.turnId, updateFallbackTurn(current, event, turnCallIds));
    }

    if (event.type === "llm_request") {
      const payload = asRecord(event.payload);
      pushUnique(modelNames, readString(payload.model));
      for (const toolName of readToolNames(payload.tools)) pushUnique(toolNames, toolName);
    }
    if (event.type === "llm_response") {
      const payload = asRecord(event.payload);
      const message = asRecord(payload.message);
      const usage = asRecord(message.usage);
      pushUnique(modelNames, readString(message.model));
      inputTokens += readNumber(usage.input);
      outputTokens += readNumber(usage.output);
      cacheReadTokens += readNumber(usage.cacheRead);
      cacheWriteTokens += readNumber(usage.cacheWrite);
      durationMs += readNumber(payload.durationMs);
    }
  }

  return {
    schemaVersion: 1,
    sessionId: first.sessionId,
    agentRunId: first.agentRunId,
    startedAt: first.timestamp,
    ...(endedAt ? { endedAt } : {}),
    status,
    truncated: false,
    turnCount: turns.size,
    llmCallCount: callIds.size,
    retryCount,
    eventCount: events.length,
    toolNames,
    modelNames,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    durationMs,
    byteSize,
    turns: [...turns.values()].sort((a, b) => a.turnIndex - b.turnIndex),
  };
}

function emptyTurn(turnId: string, turnIndex: number, startedAt: string): AgentTraceTurnSummary {
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

function updateFallbackTurn(
  current: AgentTraceTurnSummary,
  event: AgentTraceEvent,
  turnCallIds: Map<string, Set<string>>,
): AgentTraceTurnSummary {
  const next = { ...current, toolNames: [...current.toolNames], modelNames: [...current.modelNames] };
  if (event.type === "turn_end") next.endedAt = event.timestamp;
  if (event.type === "llm_retry") next.retryCount += 1;
  if (event.type === "llm_request") {
    const calls = turnCallIds.get(current.turnId) ?? new Set<string>();
    if (event.llmCallId) calls.add(event.llmCallId);
    turnCallIds.set(current.turnId, calls);
    next.llmCallCount = calls.size;
    const payload = asRecord(event.payload);
    pushUnique(next.modelNames, readString(payload.model));
    for (const name of readToolNames(payload.tools)) pushUnique(next.toolNames, name);
  }
  if (event.type === "llm_response") {
    const payload = asRecord(event.payload);
    const message = asRecord(payload.message);
    const usage = asRecord(message.usage);
    pushUnique(next.modelNames, readString(message.model));
    next.inputTokens += readNumber(usage.input);
    next.outputTokens += readNumber(usage.output);
    next.cacheReadTokens += readNumber(usage.cacheRead);
    next.cacheWriteTokens += readNumber(usage.cacheWrite);
    next.durationMs += readNumber(payload.durationMs);
  }
  return next;
}

function collectUserMessages(events: SessionEvent[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "user_message" || result.has(event.agentRunId)) continue;
    const content = (event.payload as UserMessagePayload).content;
    if (typeof content === "string" && content.trim()) result.set(event.agentRunId, content.trim());
  }
  return result;
}

function emptyAnalysisTotals(): AgentAnalysisTotals {
  return {
    agentRunCount: 0,
    turnCount: 0,
    llmCallCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 0,
  };
}

async function removeTraceDirectory(traceDir: string): Promise<AgentTraceClearResult> {
  const entries = await readdir(traceDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let filesDeleted = 0;
  let bytesFreed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = join(traceDir, entry.name);
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) continue;
    filesDeleted += 1;
    bytesFreed += stats.size;
  }
  await rm(traceDir, { recursive: true, force: true });
  return { filesDeleted, bytesFreed };
}

async function measureRunTraceBytes(sessionDir: string, agentRunId: string): Promise<number> {
  let total = 0;
  for (const filePath of [
    getAgentTraceFilePath(sessionDir, agentRunId),
    getAgentTraceSummaryFilePath(sessionDir, agentRunId),
  ]) {
    const stats = await lstat(filePath).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (stats && !stats.isSymbolicLink() && stats.isFile()) total += stats.size;
  }
  return total;
}

async function removeRunTraceFiles(sessionDir: string, agentRunId: string): Promise<AgentTraceClearResult> {
  let filesDeleted = 0;
  let bytesFreed = 0;
  for (const filePath of [
    getAgentTraceFilePath(sessionDir, agentRunId),
    getAgentTraceSummaryFilePath(sessionDir, agentRunId),
  ]) {
    const stats = await lstat(filePath).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (!stats || stats.isSymbolicLink() || !stats.isFile()) continue;
    await unlink(filePath);
    filesDeleted += 1;
    bytesFreed += stats.size;
  }
  return { filesDeleted, bytesFreed };
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

function readToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(asRecord(entry).name))
    .filter((entry): entry is string => Boolean(entry));
}

function pushUnique(values: string[], value?: string): void {
  if (value && !values.includes(value)) values.push(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
