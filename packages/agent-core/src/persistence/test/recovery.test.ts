import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { recoverSession, recoverMessages } from "../recovery";
import { appendEvents } from "../jsonl";
import { createMeta } from "../meta";
import { createSessionStorePaths } from "../session-store";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionEvent } from "@actspace/shared";

let testDir: string;

function createEvent(type: string, payload: unknown, idx: number): SessionEvent {
  return {
    id: `evt_${idx}`,
    sessionId: "test-session",
    turnId: "turn-1",
    type: type as SessionEvent["type"],
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload,
  };
}

beforeEach(async () => {
  testDir = join(tmpdir(), `actspace-test-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Session recovery", () => {
  it("should recover messages from events", async () => {
    const paths = createSessionStorePaths(testDir);
    await mkdir(paths.attachmentsDir, { recursive: true });

    const events: SessionEvent[] = [
      createEvent("user_message", { content: "Hello" }, 1),
      createEvent("assistant_message", {
        content: "Hi there",
        stopReason: "stop",
        model: "test",
        provider: "test",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }, 2),
    ];

    await appendEvents(paths.sessionPath, events);
    await createMeta(paths.metaPath, "test-session", "Test");

    const result = await recoverSession(paths);

    expect(result.meta).not.toBeNull();
    expect(result.meta!.id).toBe("test-session");
    expect(result.events.length).toBe(2);
    expect(result.messages.length).toBe(2);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.parseErrors.length).toBe(0);
  });

  it("should recover with tool call sequence", async () => {
    const paths = createSessionStorePaths(testDir);
    await mkdir(paths.attachmentsDir, { recursive: true });

    const events: SessionEvent[] = [
      createEvent("user_message", { content: "read a file" }, 1),
      createEvent("tool_call", { id: "tc1", name: "read_file", arguments: { path: "test.ts" } }, 2),
      createEvent("assistant_message", {
        content: "",
        stopReason: "toolUse",
        model: "test",
        provider: "test",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }, 3),
      createEvent("tool_result", {
        toolName: "read_file",
        toolCallId: "tc1",
        ok: true,
        summary: "Read file",
        modelOutput: "file content",
        truncatedOutput: "file content",
        rawOutput: "file content",
        uiPreview: {
          kind: "read",
          filePath: "test.ts",
          displayText: "Read file",
        },
      }, 4),
      createEvent("assistant_message", {
        content: "Here is the file content.",
        stopReason: "stop",
        model: "test",
        provider: "test",
        usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
      }, 5),
    ];

    await appendEvents(paths.sessionPath, events);
    await createMeta(paths.metaPath, "test-session");

    const result = await recoverSession(paths);

    expect(result.messages.length).toBeGreaterThanOrEqual(3);
    const roles = result.messages.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    expect(roles).toContain("toolResult");
  });

  it("should handle empty session", async () => {
    const paths = createSessionStorePaths(testDir);
    const result = await recoverSession(paths);

    expect(result.meta).toBeNull();
    expect(result.events.length).toBe(0);
    expect(result.messages.length).toBe(0);
  });

  it("recoverMessages should work standalone", async () => {
    const sessionPath = join(testDir, "session.jsonl");
    const events: SessionEvent[] = [
      createEvent("user_message", { content: "hi" }, 1),
      createEvent("assistant_message", {
        content: "hello",
        stopReason: "stop",
        model: "test",
        provider: "test",
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      }, 2),
    ];

    await appendEvents(sessionPath, events);

    const { messages, errors } = await recoverMessages(sessionPath);
    expect(messages.length).toBe(2);
    expect(errors.length).toBe(0);
  });
});
