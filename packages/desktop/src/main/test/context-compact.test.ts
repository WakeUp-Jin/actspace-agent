// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeStreamEvent } from "@actspace/shared";
import {
  appendEvents,
  createMeta,
  createPersistedSessionEvent,
  createSessionStorePaths,
  parseJsonl,
  readContextState,
  readMeta,
} from "@actspace/agent-core";
import { compactAndPersistContext } from "../context-compact";
import type { AppDataRoots } from "../agent-turn";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-compact-"));
  created.push(dataRoot);
  const sessionRoot = join(dataRoot, "sessions");
  await mkdir(sessionRoot, { recursive: true });
  return {
    dataRoot,
    sessionRoot,
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: dataRoot,
    workspaceRoot: dataRoot,
  };
}

function makeLongHistory(sessionId: string) {
  const events = [];
  const big = "x".repeat(4000);
  for (let i = 0; i < 8; i++) {
    events.push(createPersistedSessionEvent(sessionId, `turn-${i}`, "user_message", { content: `question ${i} ${big}` }));
    events.push(createPersistedSessionEvent(sessionId, `turn-${i}`, "assistant_reply", { content: `answer ${i} ${big}` }));
  }
  return events;
}

describe("compactAndPersistContext", () => {
  it("persists manual compaction events, context state, meta update, and renderer stream events", async () => {
    const roots = await makeRoots();
    const sessionId = "session-compact-main";
    const turnId = "turn-compact";
    const sessionDir = join(roots.sessionRoot, sessionId);
    const paths = createSessionStorePaths(sessionDir);
    await mkdir(sessionDir, { recursive: true });
    await createMeta(paths.metaPath, sessionId, "Manual compact");
    await appendEvents(paths.sessionPath, makeLongHistory(sessionId));

    const streamEvents: RuntimeStreamEvent[] = [];
    const webContents = {
      send: vi.fn((_channel: string, event: RuntimeStreamEvent) => streamEvents.push(event)),
    };

    const beforeMeta = await readMeta(paths.metaPath);
    const result = await compactAndPersistContext(
      { sessionId, turnId },
      roots,
      () => ({ webContents } as never),
    );

    expect(result.status).toBe("compacted");
    expect(webContents.send).toHaveBeenCalledWith("agent:stream", expect.objectContaining({
      type: "context_compaction_started",
      trigger: "manual",
    }));
    expect(streamEvents.map((event) => event.type)).toEqual([
      "context_compaction_started",
      "context_compaction_progress",
      "context_compaction_progress",
      "context_compaction_finished",
    ]);

    const parsed = await parseJsonl(paths.sessionPath);
    const persistedCompaction = parsed.events.find((event) => event.turnId === turnId && event.type === "context_compaction");
    expect(persistedCompaction?.payload).toMatchObject({
      trigger: "manual",
      status: "compacted",
    });
    expect(parsed.events.some((event) => event.turnId === turnId && event.type === "context_snapshot")).toBe(true);

    const persistedState = await readContextState(paths);
    expect(persistedState?.sessionId).toBe(sessionId);
    expect(persistedState?.activeTurnId).toBe(turnId);

    const afterMeta = await readMeta(paths.metaPath);
    expect(afterMeta?.turnCount).toBe(beforeMeta?.turnCount);
    expect(afterMeta?.updatedAt).not.toBe(beforeMeta?.updatedAt);

    const rawSession = await readFile(paths.sessionPath, "utf8");
    expect(rawSession).toContain("context_compaction");
  });
});
