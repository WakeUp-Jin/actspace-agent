import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSessionRecord,
  listSessionRecords,
  readContextState,
  readSessionRecord,
  createSessionStorePaths,
  setSessionPinned,
  writeContextState,
} from "../session-store";
import { readMeta } from "../meta";

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

  it("persists workspaceRoot on session meta when creating", async () => {
    const workspaceRoot = "/Users/test/projects/foo-repo";
    const record = await createSessionRecord(sessionRoot, {
      title: "Workspace-aware session",
      workspaceRoot,
    });

    expect(record.meta.workspaceRoot).toBe(workspaceRoot);
    expect(record.meta.pinned).toBe(false);

    const listed = await listSessionRecords(sessionRoot);
    expect(listed).toEqual([
      expect.objectContaining({
        id: record.meta.id,
        workspaceRoot,
      }),
    ]);
  });

  it("toggles pinned via setSessionPinned and surfaces it in list/meta", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "To pin" });

    await expect(setSessionPinned(sessionRoot, record.meta.id, true)).resolves.toEqual({ ok: true });

    const metaAfterPin = await readMeta(join(sessionRoot, record.meta.id, "meta.json"));
    expect(metaAfterPin?.pinned).toBe(true);

    const listed = await listSessionRecords(sessionRoot);
    expect(listed).toEqual([
      expect.objectContaining({ id: record.meta.id, pinned: true }),
    ]);

    await expect(setSessionPinned(sessionRoot, record.meta.id, false)).resolves.toEqual({ ok: true });
    const metaAfterUnpin = await readMeta(join(sessionRoot, record.meta.id, "meta.json"));
    expect(metaAfterUnpin?.pinned).toBe(false);
  });

  it("writes and restores context-state.json independently from session events", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "Context state" });
    const paths = createSessionStorePaths(join(sessionRoot, record.meta.id));

    const state = {
      sessionId: record.meta.id,
      activeTurnId: "turn-1",
      updatedAt: new Date().toISOString(),
      estimator: { name: "char-ratio", version: "1" },
      totalEstimatedTokens: 10,
      maxTokens: 100,
      percentUsed: 10,
      buckets: [{ key: "conversation" as const, tokens: 10 }],
      entries: [
        {
          id: "context_conversation",
          kind: "conversation" as const,
          title: "Conversation",
          estimatedTokens: 10,
          included: true,
        },
      ],
    };

    await expect(writeContextState(paths, state)).resolves.toEqual({ ok: true });
    await expect(readContextState(paths)).resolves.toEqual(state);

    const restored = await readSessionRecord(paths);
    expect(restored?.events).toEqual([]);
    expect(restored?.contextState).toEqual(state);
  });
});
