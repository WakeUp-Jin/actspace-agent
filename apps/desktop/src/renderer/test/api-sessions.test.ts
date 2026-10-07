import { describe, expect, it, vi } from "vitest";
import { projectChatEvents, projectChatWindow } from "@actspace/client/sessions";
import { createMessageBlocks, type SessionRecord } from "@actspace/shared";
import type { DesktopToolDetailPage } from "@actspace/shared/desktop-bridge";
import type { RuntimeV2DesktopSessionProjection } from "@actspace/shared/runtime-v2";
import { createSession, forkSession, getSession, getSessionToolDetail } from "../api/sessions";
import { projectionFixture, recordProjectionFixture } from "./projection-fixture";
import { overrideBridge } from "./helpers/bridge";

/** 迁移前 preload 的实现（`apps/desktop/src/preload/index.ts`，desktop-fe-13 T4 之前），原样保留做对照。 */
const legacyPreload = {
  createSession: (projection: RuntimeV2DesktopSessionProjection) => projectChatWindow(projection),
  getSession: (projection: RuntimeV2DesktopSessionProjection | null) => projection ? projectChatWindow(projection) : null,
  getSessionToolDetail: (page: DesktopToolDetailPage) => createMessageBlocks(projectChatEvents(page.snapshot, page.journal)),
};

function conversation(): RuntimeV2DesktopSessionProjection {
  const at = "2026-09-21T00:00:00Z";
  const record: SessionRecord = {
    meta: { schemaVersion: 2, id: "s1", title: "Projected", createdAt: at, updatedAt: at, agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
    events: [
      { id: "u1", sessionId: "s1", agentRunId: "r1", schemaVersion: 2, timestamp: at, type: "user_message", payload: { content: "列出文件" } },
      { id: "t1", sessionId: "s1", agentRunId: "r1", schemaVersion: 2, timestamp: at, type: "tool_call", payload: { id: "call-1", name: "glob", arguments: { pattern: "**/*.ts" } } },
      { id: "t2", sessionId: "s1", agentRunId: "r1", schemaVersion: 2, timestamp: at, type: "tool_result", payload: { toolCallId: "call-1", toolName: "glob", status: "completed", summary: "2 files", modelOutput: "a.ts\nb.ts" } },
      { id: "a1", sessionId: "s1", agentRunId: "r1", schemaVersion: 2, timestamp: at, type: "assistant_message", payload: { content: "共 2 个文件。" } },
    ],
    messageBlocks: [],
    contextSnapshot: null,
    contextState: null,
  };
  return recordProjectionFixture(record);
}

function installSessions(sessions: Partial<Record<"create" | "fork" | "get" | "getToolDetail", (...args: unknown[]) => Promise<unknown>>>) {
  overrideBridge(Object.fromEntries(Object.entries(sessions).map(([member, fn]) => [`sessions.${member}`, fn])));
}

describe("renderer sessions api", () => {
  it("projects created and forked sessions exactly like the old preload", async () => {
    const projection = conversation();
    const create = vi.fn(async () => projection);
    const fork = vi.fn(async () => projection);
    installSessions({ create, fork });

    const created = await createSession({ workspaceRoot: "/tmp/workspace" });
    expect(created).toEqual(legacyPreload.createSession(projection));
    expect(created.messageBlocks?.length).toBeGreaterThan(0);
    expect(create).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace" });
    expect(await forkSession({ sessionId: "s1" })).toEqual(legacyPreload.createSession(projection));
    expect(fork).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("leaves the default input to the bridge when called without input", async () => {
    const create = vi.fn(async () => projectionFixture("empty"));
    installSessions({ create });

    await createSession();
    // api 层不补默认值；由契约的 defaultInput（`{}`）在 bridge 里补上，mock 与 preload 走同一个 buildBridge。
    expect(create).toHaveBeenCalledWith({});
  });

  it("projects loaded sessions and keeps a missing session as null", async () => {
    const projection = conversation();
    installSessions({ get: async () => projection });
    expect(await getSession({ sessionId: "s1" })).toEqual(legacyPreload.getSession(projection));

    installSessions({ get: async () => null });
    expect(await getSession({ sessionId: "missing" })).toBeNull();
  });

  it("turns a tool detail page into message blocks like the old preload", async () => {
    const projection = conversation();
    const page: DesktopToolDetailPage = { snapshot: projection.snapshot, journal: projection.window.events };
    const getToolDetail = vi.fn(async () => page);
    installSessions({ getToolDetail });

    const blocks = await getSessionToolDetail({ sessionId: "s1", callId: "call-1" });
    expect(blocks).toEqual(legacyPreload.getSessionToolDetail(page));
    expect(blocks.length).toBeGreaterThan(0);
    expect(getToolDetail).toHaveBeenCalledWith({ sessionId: "s1", callId: "call-1" });
  });
});
