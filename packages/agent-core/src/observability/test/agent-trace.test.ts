import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createAgentTraceWriter, sanitizeTraceValue } from "../agent-trace";

describe("agent trace", () => {
  it("writes ordered JSONL under the session traces directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-agent-trace-"));
    const sessionDir = join(root, "sessions", "session-1");
    const writer = await createAgentTraceWriter({
      sessionDir,
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    });

    await Promise.all([
      writer.write({
        type: "agent_run_start",
        sessionId: "session-1",
        agentRunId: "agent-run-1",
        payload: {},
      }),
      writer.write({
        type: "turn_start",
        sessionId: "session-1",
        agentRunId: "agent-run-1",
        turnId: "turn-1",
        turnIndex: 1,
        payload: {},
      }),
    ]);

    expect(writer.filePath).toBe(join(sessionDir, "traces", "agent-run-1.jsonl"));
    const events = (await readFile(writer.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events.map((event) => event.type)).toEqual(["agent_run_start", "turn_start"]);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    });
    expect(events[1]).toMatchObject({ turnId: "turn-1", turnIndex: 1 });
    const summary = JSON.parse(await readFile(writer.summaryFilePath, "utf8")) as Record<string, unknown>;
    expect(summary).toMatchObject({
      schemaVersion: 1,
      sessionId: "session-1",
      agentRunId: "agent-run-1",
      status: "recording",
      turnCount: 1,
      eventCount: 2,
      truncated: false,
    });
  });

  it("redacts credentials, binary payloads, and signed URL parameters", () => {
    const sanitized = sanitizeTraceValue({
      Authorization: "Bearer secret-token",
      nested: {
        apiKey: "sk-secret",
        safe: "visible",
      },
      image: "data:image/png;base64,AAAA",
      binary: "A".repeat(1200),
      url: "https://example.com/file.png?X-Amz-Signature=secret&width=300",
    });

    expect(sanitized).toEqual({
      Authorization: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        safe: "visible",
      },
      image: "[REDACTED_DATA_URL]",
      binary: "[REDACTED_BASE64:1200]",
      url: "https://example.com/file.png?X-Amz-Signature=REDACTED&width=300",
    });
  });

  it("keeps only safe fields from Error instances", () => {
    const error = Object.assign(new Error("provider failed"), {
      code: "429",
      status: 429,
      responseBody: "contains an upstream credential",
    });

    expect(sanitizeTraceValue(error)).toEqual({
      name: "Error",
      message: "provider failed",
      code: "429",
      status: 429,
    });
  });

  it("records failed Agent Runs as terminal summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-agent-trace-failed-"));
    const writer = await createAgentTraceWriter({
      sessionDir: join(root, "session-1"),
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    });
    await writer.write({
      type: "agent_run_start",
      sessionId: "session-1",
      agentRunId: "agent-run-1",
      payload: {},
    });
    await writer.write({
      type: "agent_run_end",
      sessionId: "session-1",
      agentRunId: "agent-run-1",
      payload: { status: "failed", error: new Error("provider failed") },
    });

    await expect(readFile(writer.summaryFilePath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      status: "failed",
      endedAt: expect.any(String),
      eventCount: 2,
    });
  });

  it("rejects unsafe paths and mixed trace identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-agent-trace-identity-"));
    await expect(createAgentTraceWriter({
      sessionDir: join(root, "session-1"),
      sessionId: "../session-1",
      agentRunId: "agent-run-1",
    })).rejects.toThrow("safe path segments");

    const writer = await createAgentTraceWriter({
      sessionDir: join(root, "session-1"),
      sessionId: "session-1",
      agentRunId: "agent-run-1",
    });
    await expect(writer.write({
      type: "agent_run_start",
      sessionId: "session-1",
      agentRunId: "agent-run-2",
      payload: {},
    })).rejects.toThrow("identity does not match");
  });
});
