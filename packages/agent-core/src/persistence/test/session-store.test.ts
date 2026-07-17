import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSessionRecord,
  listSessionRecords,
  readContextState,
  readSubAgentTranscript,
  readSessionRecord,
  createSessionStorePaths,
  setSessionArchived,
  setSessionPinned,
  setSessionWorkspace,
  setSessionTitle,
  writeContextState,
  writeSessionResult,
  writeSubAgentTranscripts,
} from "../session-store";
import { appendEvents } from "../jsonl";
import { readMeta } from "../meta";
import type { SessionEvent, SubAgentTranscriptRef } from "@actspace/shared";

let sessionRoot: string;

beforeEach(async () => {
  sessionRoot = join(tmpdir(), `actspace-test-session-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(sessionRoot, { recursive: true });
});

afterEach(async () => {
  await rm(sessionRoot, { recursive: true, force: true });
});

function createTranscriptEvent(sessionId: string, turnId: string): SessionEvent {
  return {
    id: "evt-subagent-report",
    sessionId,
    turnId,
    type: "assistant_message",
    timestamp: "2026-06-02T10:00:00.000Z",
    schemaVersion: 1,
    payload: {
      content: "SubAgent report",
      stopReason: "stop",
      model: "mock-model",
      provider: "mock",
    },
  };
}

function createTranscriptRef(sessionId: string, partial: Partial<SubAgentTranscriptRef> = {}): SubAgentTranscriptRef {
  return {
    kind: "subagent_transcript",
    sessionId,
    turnId: "turn-1",
    runId: "run-1",
    ...partial,
  };
}

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

  it("keeps one prewritten user message and the aborted terminal event", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "Abort recovery" });
    const paths = createSessionStorePaths(join(sessionRoot, record.meta.id));
    const turnId = "turn-aborted";
    const timestamp = new Date().toISOString();
    const userEvent: SessionEvent = {
      id: "evt-user-aborted",
      sessionId: record.meta.id,
      turnId,
      type: "user_message",
      timestamp,
      schemaVersion: 1,
      payload: { content: "stop this turn" },
    };
    const abortedEvent: SessionEvent = {
      id: "evt-turn-aborted",
      sessionId: record.meta.id,
      turnId,
      type: "turn_aborted",
      timestamp,
      schemaVersion: 1,
      payload: { reason: "user" },
    };

    await expect(appendEvents(paths.sessionPath, [userEvent])).resolves.toEqual({ ok: true });
    await expect(writeSessionResult(paths, {
      sessionId: record.meta.id,
      turnId,
      events: [abortedEvent],
      status: "aborted",
      contextSnapshot: {
        totalTokens: 0,
        maxTokens: 200_000,
        percentUsed: 0,
        buckets: [],
      },
    })).resolves.toEqual({ ok: true });

    const restored = await readSessionRecord(paths);
    expect(restored?.events.map((event) => event.type)).toEqual(["user_message", "turn_aborted"]);
    expect(restored?.meta.turnCount).toBe(1);
  });

  it("persists workspaceRoot on session meta when creating", async () => {
    const workspaceId = "ws_foo_repo";
    const workspaceRoot = "/Users/test/projects/foo-repo";
    const record = await createSessionRecord(sessionRoot, {
      title: "Workspace-aware session",
      workspaceId,
      workspaceRoot,
    });

    expect(record.meta.workspaceId).toBe(workspaceId);
    expect(record.meta.workspaceRoot).toBe(workspaceRoot);
    expect(record.meta.pinned).toBe(false);

    const listed = await listSessionRecords(sessionRoot);
    expect(listed).toEqual([
      expect.objectContaining({
        id: record.meta.id,
        workspaceId,
        workspaceRoot,
      }),
    ]);
  });

  it("updates workspaceId and workspaceRoot together", async () => {
    const record = await createSessionRecord(sessionRoot, {
      title: "Workspace switch",
      workspaceId: "default",
      workspaceRoot: "/Users/test/Downloads",
    });

    await expect(
      setSessionWorkspace(sessionRoot, record.meta.id, "/Users/test/projects/next", "ws_next"),
    ).resolves.toEqual({ ok: true });

    const metaAfterSwitch = await readMeta(join(sessionRoot, record.meta.id, "meta.json"));
    expect(metaAfterSwitch?.workspaceId).toBe("ws_next");
    expect(metaAfterSwitch?.workspaceRoot).toBe("/Users/test/projects/next");

    const listed = await listSessionRecords(sessionRoot);
    expect(listed).toEqual([
      expect.objectContaining({
        id: record.meta.id,
        workspaceId: "ws_next",
        workspaceRoot: "/Users/test/projects/next",
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

  it("renames a session via setSessionTitle and surfaces it in list/meta", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "Old title" });

    await expect(setSessionTitle(sessionRoot, record.meta.id, "  New title  ")).resolves.toEqual({ ok: true });

    const metaAfterRename = await readMeta(join(sessionRoot, record.meta.id, "meta.json"));
    expect(metaAfterRename?.title).toBe("New title");

    const listed = await listSessionRecords(sessionRoot);
    expect(listed).toEqual([
      expect.objectContaining({ id: record.meta.id, title: "New title" }),
    ]);

    await expect(setSessionTitle(sessionRoot, record.meta.id, "   ")).resolves.toEqual({
      ok: false,
      error: "title is required",
    });
  });

  it("filters archived sessions out of the default list and restores them on unarchive", async () => {
    const active = await createSessionRecord(sessionRoot, { title: "Active session" });
    const archived = await createSessionRecord(sessionRoot, { title: "Archived session" });

    await expect(setSessionArchived(sessionRoot, archived.meta.id, true)).resolves.toEqual({ ok: true });

    const metaAfterArchive = await readMeta(join(sessionRoot, archived.meta.id, "meta.json"));
    expect(metaAfterArchive?.archived).toBe(true);

    const defaultList = await listSessionRecords(sessionRoot);
    expect(defaultList.map((item) => item.id)).toEqual([active.meta.id]);

    const archivedList = await listSessionRecords(sessionRoot, { archived: true });
    expect(archivedList).toEqual([
      expect.objectContaining({ id: archived.meta.id, archived: true }),
    ]);

    await expect(setSessionArchived(sessionRoot, archived.meta.id, false)).resolves.toEqual({ ok: true });

    const restoredDefaultList = await listSessionRecords(sessionRoot);
    expect(restoredDefaultList.map((item) => item.id).sort()).toEqual([active.meta.id, archived.meta.id].sort());
    await expect(listSessionRecords(sessionRoot, { archived: true })).resolves.toEqual([]);
  });

  it("keeps pinned archived sessions out of the default list", async () => {
    const pinned = await createSessionRecord(sessionRoot, { title: "Pinned archived" });

    await expect(setSessionPinned(sessionRoot, pinned.meta.id, true)).resolves.toEqual({ ok: true });
    await expect(setSessionArchived(sessionRoot, pinned.meta.id, true)).resolves.toEqual({ ok: true });

    await expect(listSessionRecords(sessionRoot)).resolves.toEqual([]);
    await expect(listSessionRecords(sessionRoot, { archived: true })).resolves.toEqual([
      expect.objectContaining({ id: pinned.meta.id, pinned: true, archived: true }),
    ]);
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

  it("writes and reads SubAgent transcripts outside the main session event stream", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "SubAgent transcript" });
    const paths = createSessionStorePaths(join(sessionRoot, record.meta.id));
    const ref = createTranscriptRef(record.meta.id);
    const event = createTranscriptEvent(record.meta.id, "turn-1:subagent:run-1");

    await expect(writeSubAgentTranscripts(paths, [{ transcriptRef: ref, events: [event] }])).resolves.toEqual({
      ok: true,
    });
    await expect(readSubAgentTranscript(paths, ref)).resolves.toEqual([event]);

    const restored = await readSessionRecord(paths);
    expect(restored?.events).toEqual([]);
  });

  it("rejects SubAgent transcript refs that do not belong to the session root", async () => {
    const first = await createSessionRecord(sessionRoot, { title: "First" });
    const second = await createSessionRecord(sessionRoot, { title: "Second" });
    const firstPaths = createSessionStorePaths(join(sessionRoot, first.meta.id));
    const secondPaths = createSessionStorePaths(join(sessionRoot, second.meta.id));
    const ref = createTranscriptRef(first.meta.id);
    const event = createTranscriptEvent(first.meta.id, "turn-1:subagent:run-1");

    await expect(writeSubAgentTranscripts(firstPaths, [{ transcriptRef: ref, events: [event] }])).resolves.toEqual({
      ok: true,
    });
    await expect(readSubAgentTranscript(secondPaths, ref)).resolves.toEqual([]);
  });

  it("rejects unsafe SubAgent transcript path segments", async () => {
    const record = await createSessionRecord(sessionRoot, { title: "Unsafe transcript" });
    const paths = createSessionStorePaths(join(sessionRoot, record.meta.id));
    const unsafeRef = createTranscriptRef(record.meta.id, { turnId: "../turn-1", runId: "run-1" });
    const event = createTranscriptEvent(record.meta.id, "turn-1:subagent:run-1");

    await expect(writeSubAgentTranscripts(paths, [{ transcriptRef: unsafeRef, events: [event] }])).resolves.toEqual({
      ok: false,
      error: "Invalid SubAgent transcript reference.",
    });
    await expect(readSubAgentTranscript(paths, unsafeRef)).resolves.toEqual([]);
  });
});
