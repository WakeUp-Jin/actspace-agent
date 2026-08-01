import { access, mkdir, readFile, symlink, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { AgentTraceEvent } from "@actspace/shared";
import { AGENT_TRACE_MAX_BYTES } from "@actspace/agent-core";
import {
  AGENT_TRACE_RETENTION_MS,
  clearAgentTraces,
  enforceAgentTraceRetention,
  getAgentAnalysisIndex,
  listAgentTraces,
  readAgentTrace,
} from "../agent-trace-service";

describe("agent trace service", () => {
  it("lists and reads a session-scoped trace", async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), "actspace-trace-service-"));
    const traceDir = join(sessionRoot, "session-1", "traces");
    await mkdir(traceDir, { recursive: true });
    const events: AgentTraceEvent[] = [
      traceEvent("agent_run_start", "2026-07-29T10:00:00.000Z"),
      { ...traceEvent("turn_start", "2026-07-29T10:00:00.100Z"), turnId: "turn-1", turnIndex: 1 },
      {
        ...traceEvent("llm_request", "2026-07-29T10:00:00.200Z"),
        turnId: "turn-1",
        turnIndex: 1,
        llmCallId: "call-1",
        attempt: 1,
      },
      {
        ...traceEvent("llm_retry", "2026-07-29T10:00:00.300Z"),
        turnId: "turn-1",
        turnIndex: 1,
        llmCallId: "call-1",
        attempt: 2,
      },
      traceEvent("agent_run_end", "2026-07-29T10:00:01.000Z"),
    ];
    await writeFile(join(traceDir, "agent-run-1.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

    await expect(listAgentTraces(sessionRoot, { sessionId: "session-1" })).resolves.toMatchObject({
      traces: [{
        schemaVersion: 1,
        sessionId: "session-1",
        agentRunId: "agent-run-1",
        startedAt: "2026-07-29T10:00:00.000Z",
        endedAt: "2026-07-29T10:00:01.000Z",
        turnCount: 1,
        llmCallCount: 1,
        retryCount: 1,
        eventCount: 5,
        status: "completed",
        truncated: false,
        turns: [{ turnId: "turn-1", turnIndex: 1, llmCallCount: 1, retryCount: 1 }],
      }],
    });
    await expect(readAgentTrace(sessionRoot, {
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    })).resolves.toMatchObject({ events });
  });

  it("builds a session analysis index and clears traces without deleting the session", async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), "actspace-analysis-index-"));
    const sessionDir = join(sessionRoot, "session-1");
    const traceDir = join(sessionDir, "traces");
    await mkdir(traceDir, { recursive: true });
    await writeFile(join(sessionDir, "meta.json"), JSON.stringify({
      schemaVersion: 2,
      id: "session-1",
      title: "Observability session",
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:01.000Z",
      agentRunCount: 1,
    }));
    await writeFile(join(sessionDir, "session.jsonl"), `${JSON.stringify({
      id: "event-user-1",
      schemaVersion: 2,
      sessionId: "session-1",
      agentRunId: "agent-run-1",
      type: "user_message",
      timestamp: "2026-07-29T10:00:00.000Z",
      payload: { content: "检查 Agent 事件层级" },
    })}\n`);
    const events: AgentTraceEvent[] = [
      traceEvent("agent_run_start", "2026-07-29T10:00:00.000Z"),
      { ...traceEvent("turn_start", "2026-07-29T10:00:00.100Z"), turnId: "turn-1", turnIndex: 1 },
      {
        ...traceEvent("llm_request", "2026-07-29T10:00:00.200Z"),
        turnId: "turn-1",
        turnIndex: 1,
        llmCallId: "call-1",
        attempt: 1,
        payload: { model: "kimi-k2", tools: [{ name: "glob" }] },
      },
      {
        ...traceEvent("llm_response", "2026-07-29T10:00:00.800Z"),
        turnId: "turn-1",
        turnIndex: 1,
        llmCallId: "call-1",
        attempt: 1,
        payload: { durationMs: 600, message: { model: "kimi-k2", usage: { input: 100, output: 20, cacheRead: 40, cacheWrite: 0 } } },
      },
      traceEvent("agent_run_end", "2026-07-29T10:00:01.000Z"),
    ];
    await writeFile(join(traceDir, "agent-run-1.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

    await expect(getAgentAnalysisIndex(sessionRoot, { sessionId: "session-1" })).resolves.toMatchObject({
      title: "Observability session",
      totals: { agentRunCount: 1, turnCount: 1, llmCallCount: 1, inputTokens: 100, outputTokens: 20 },
      toolNames: ["glob"],
      runs: [{ userMessagePreview: "检查 Agent 事件层级", modelNames: ["kimi-k2"] }],
    });
    await expect(clearAgentTraces(sessionRoot, { scope: "session", sessionId: "session-1" })).resolves.toMatchObject({ filesDeleted: 1 });
    await expect(readFile(join(sessionDir, "session.jsonl"), "utf8")).resolves.toContain("检查 Agent 事件层级");
  });

  it("rejects traversal identifiers and symbolic-link trace files", async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), "actspace-trace-safety-"));
    await expect(readAgentTrace(sessionRoot, {
      sessionId: "../outside",
      agentRunId: "agent-run-1",
    })).rejects.toThrow("Invalid sessionId");

    const traceDir = join(sessionRoot, "session-1", "traces");
    await mkdir(traceDir, { recursive: true });
    const outside = join(sessionRoot, "outside.jsonl");
    await writeFile(outside, `${JSON.stringify(traceEvent("agent_run_start", "2026-07-29T10:00:00.000Z"))}\n`);
    await symlink(outside, join(traceDir, "agent-run-1.jsonl"));

    await expect(readAgentTrace(sessionRoot, {
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    })).rejects.toThrow("regular file");
  });

  it("isolates corrupt summaries and falls back to the matching JSONL", async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), "actspace-trace-corrupt-"));
    const traceDir = join(sessionRoot, "session-1", "traces");
    await mkdir(traceDir, { recursive: true });
    const validEvents = [
      traceEvent("agent_run_start", "2026-07-29T10:00:00.000Z", "agent-run-1"),
      traceEvent("agent_run_end", "2026-07-29T10:00:01.000Z", "agent-run-1"),
    ];
    await writeFile(join(traceDir, "agent-run-1.jsonl"), `${validEvents.map((event) => JSON.stringify(event)).join("\n")}\n`);
    await writeFile(join(traceDir, "agent-run-1.summary.json"), "{not-json");
    await writeFile(join(traceDir, "agent-run-broken.summary.json"), "{also-broken");

    await expect(listAgentTraces(sessionRoot, { sessionId: "session-1" })).resolves.toMatchObject({
      traces: [{ agentRunId: "agent-run-1", status: "completed" }],
    });
    await expect(readAgentTrace(sessionRoot, {
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    })).resolves.toMatchObject({ trace: { agentRunId: "agent-run-1" }, events: validEvents });
  });

  it("ignores one trailing partial line but rejects middle corruption and oversized files", async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), "actspace-trace-bounds-"));
    const traceDir = join(sessionRoot, "session-1", "traces");
    await mkdir(traceDir, { recursive: true });
    const valid = JSON.stringify(traceEvent("agent_run_start", "2026-07-29T10:00:00.000Z"));
    const filePath = join(traceDir, "agent-run-1.jsonl");

    await writeFile(filePath, `${valid}\n{"schemaVersion":1`);
    await expect(readAgentTrace(sessionRoot, {
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    })).resolves.toMatchObject({ events: [{ type: "agent_run_start" }] });

    await writeFile(filePath, `${valid}\nnot-json\n${valid}\n`);
    await expect(readAgentTrace(sessionRoot, {
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    })).rejects.toThrow("line 2");

    await writeFile(filePath, valid);
    await truncate(filePath, AGENT_TRACE_MAX_BYTES + 1);
    await expect(readAgentTrace(sessionRoot, {
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    })).rejects.toThrow("read limit");
  });

  it("removes expired terminal traces while preserving recording traces", async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), "actspace-trace-retention-"));
    const traceDir = join(sessionRoot, "session-1", "traces");
    await mkdir(traceDir, { recursive: true });
    const oldTimestamp = "2026-06-01T00:00:00.000Z";
    const now = Date.parse(oldTimestamp) + AGENT_TRACE_RETENTION_MS + 1;

    await writeTracePair(traceDir, "terminal-run", {
      startedAt: oldTimestamp,
      endedAt: oldTimestamp,
      status: "completed",
    });
    await writeTracePair(traceDir, "active-run", {
      startedAt: oldTimestamp,
      status: "recording",
    });

    await expect(enforceAgentTraceRetention(sessionRoot, now)).resolves.toMatchObject({ filesDeleted: 2 });
    await expect(access(join(traceDir, "terminal-run.jsonl"))).rejects.toThrow();
    await expect(access(join(traceDir, "terminal-run.summary.json"))).rejects.toThrow();
    await expect(access(join(traceDir, "active-run.jsonl"))).resolves.toBeUndefined();
    await expect(access(join(traceDir, "active-run.summary.json"))).resolves.toBeUndefined();
  });
});

function traceEvent(type: AgentTraceEvent["type"], timestamp: string, agentRunId = "agent-run-1"): AgentTraceEvent {
  return {
    schemaVersion: 1,
    timestamp,
    sessionId: "session-1",
    agentRunId,
    type,
    payload: {},
  };
}

async function writeTracePair(
  traceDir: string,
  agentRunId: string,
  input: { startedAt: string; endedAt?: string; status: "recording" | "completed" | "failed" },
): Promise<void> {
  await writeFile(join(traceDir, `${agentRunId}.jsonl`), `${JSON.stringify(traceEvent("agent_run_start", input.startedAt, agentRunId))}\n`);
  await writeFile(join(traceDir, `${agentRunId}.summary.json`), JSON.stringify({
    schemaVersion: 1,
    sessionId: "session-1",
    agentRunId,
    startedAt: input.startedAt,
    ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    status: input.status,
    truncated: false,
    turnCount: 0,
    llmCallCount: 0,
    retryCount: 0,
    eventCount: 1,
    toolNames: [],
    modelNames: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 0,
    byteSize: 1,
    turns: [],
  }));
}
