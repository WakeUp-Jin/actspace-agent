import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSessionRecord, listSessionRecords, readSessionRecord, createSessionStorePaths } from "../session-store";

let sessionRoot: string;

beforeEach(async () => {
  sessionRoot = join(tmpdir(), `actspace-test-session-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(sessionRoot, { recursive: true });
});

afterEach(async () => {
  await rm(sessionRoot, { recursive: true, force: true });
});

describe("session store", () => {
  it("creates an empty session record and lists it", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "New chat" });

    expect(record.meta.title).toBe("New chat");
    expect(record.meta.turnCount).toBe(0);
    expect(record.events).toEqual([]);

    const listed = await listSessionRecords(sessionRoot);
    expect(listed).toEqual([
      expect.objectContaining({
        id: record.meta.id,
        title: "New chat",
        turnCount: 0,
      }),
    ]);

    const restored = await readSessionRecord(createSessionStorePaths(join(sessionRoot, record.meta.id)));
    expect(restored?.meta.id).toBe(record.meta.id);
    expect(restored?.events).toEqual([]);

    const sessionFile = await readFile(join(sessionRoot, record.meta.id, "session.jsonl"), "utf-8");
    expect(sessionFile).toBe("");
  });
});
