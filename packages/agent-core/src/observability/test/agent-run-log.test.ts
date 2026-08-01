import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupOldAgentRunLogs,
  createAgentRunLogger,
} from "../agent-run-log";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "actspace-agent-run-log-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("agent run log", () => {
  it("writes jsonl events for a run", async () => {
    const logger = await createAgentRunLogger({
      logRoot: testDir,
      sessionId: "session/1",
      agentRunId: "turn:1",
      now: new Date(2026, 4, 24, 13, 30, 0),
    });

    await logger.write({ type: "run_started", payload: { userInput: "hello" } });
    await logger.write({ type: "run_finished", payload: { status: "completed" } });

    const content = await readFile(logger.filePath, "utf-8");
    const lines = content.trim().split("\n").map((line) => JSON.parse(line));

    expect(logger.filePath).toContain("20260524-133000-session1-turn1.jsonl");
    expect(lines).toMatchObject([
      { type: "run_started", payload: { userInput: "hello" } },
      { type: "run_finished", payload: { status: "completed" } },
    ]);
  });

  it("removes jsonl logs older than the retention window", async () => {
    const oldLogger = await createAgentRunLogger({
      logRoot: testDir,
      sessionId: "old",
      agentRunId: "turn",
      now: new Date(2026, 4, 23, 12, 0, 0),
    });
    const freshLogger = await createAgentRunLogger({
      logRoot: testDir,
      sessionId: "fresh",
      agentRunId: "turn",
      now: new Date(2026, 4, 24, 12, 30, 0),
    });

    await oldLogger.write({ type: "run_started" });
    await freshLogger.write({ type: "run_started" });
    await cleanupOldAgentRunLogs(
      testDir,
      24 * 60 * 60 * 1000,
      new Date(2026, 4, 24, 12, 30, 1).getTime(),
    );

    const files = await readdir(join(testDir, "agent-runs"));
    expect(files).not.toContain("20260523-120000-old-turn.jsonl");
    expect(files).toContain("20260524-123000-fresh-turn.jsonl");
  });
});
