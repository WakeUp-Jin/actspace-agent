import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appendEvent, appendEvents, parseJsonl } from "../jsonl";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionEvent } from "@actspace/shared";

let testDir: string;

function createTestEvent(type: string, idx: number): SessionEvent {
  return {
    id: `evt_${idx}`,
    sessionId: "test-session",
    turnId: "turn-1",
    type: type as SessionEvent["type"],
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload: { content: `event ${idx}` },
  };
}

beforeEach(async () => {
  testDir = join(tmpdir(), `actspace-test-jsonl-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("JSONL write/read", () => {
  it("should append and parse a single event", async () => {
    const path = join(testDir, "session.jsonl");
    const event = createTestEvent("user_message", 1);

    const writeResult = await appendEvent(path, event);
    expect(writeResult.ok).toBe(true);

    const parsed = await parseJsonl(path);
    expect(parsed.events.length).toBe(1);
    expect(parsed.errors.length).toBe(0);
    expect(parsed.events[0].id).toBe("evt_1");
  });

  it("should append multiple events in batch", async () => {
    const path = join(testDir, "session.jsonl");
    const events = [
      createTestEvent("user_message", 1),
      createTestEvent("assistant_message", 2),
      createTestEvent("tool_call", 3),
    ];

    const writeResult = await appendEvents(path, events);
    expect(writeResult.ok).toBe(true);

    const parsed = await parseJsonl(path);
    expect(parsed.events.length).toBe(3);
    expect(parsed.totalLines).toBe(3);
  });

  it("should handle non-existent file gracefully", async () => {
    const path = join(testDir, "nonexistent.jsonl");
    const parsed = await parseJsonl(path);

    expect(parsed.events.length).toBe(0);
    expect(parsed.errors.length).toBe(0);
    expect(parsed.totalLines).toBe(0);
  });

  it("should tolerate bad lines without crashing", async () => {
    const path = join(testDir, "mixed.jsonl");
    const validEvent = createTestEvent("user_message", 1);
    const content = [
      JSON.stringify(validEvent),
      "this is not valid json",
      JSON.stringify(createTestEvent("assistant_message", 2)),
      "{broken json",
    ].join("\n") + "\n";

    await writeFile(path, content);

    const parsed = await parseJsonl(path);
    // normalizeSessionEvents may filter, but errors should be captured
    expect(parsed.errors.length).toBe(2);
    expect(parsed.totalLines).toBe(4);
  });

  it("should create directories if they do not exist", async () => {
    const nestedPath = join(testDir, "deep", "nested", "session.jsonl");
    const event = createTestEvent("user_message", 1);

    const result = await appendEvent(nestedPath, event);
    expect(result.ok).toBe(true);

    const parsed = await parseJsonl(nestedPath);
    expect(parsed.events.length).toBe(1);
  });
});
