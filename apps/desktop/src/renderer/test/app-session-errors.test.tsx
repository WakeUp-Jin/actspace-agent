import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionListItem, SessionRecord } from "@actspace/shared";
import type { TaskSnapshot } from "@actspace/shared/runtime-v2";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";
import { recordProjectionFixture } from "./projection-fixture";

// 14 T19：打开会话、会话同步和队列刷新失败时在界面上可见，并能重试。
const NOW = "2026-10-06T00:00:00.000Z";
const SESSION = "s-err";

function listItem(): SessionListItem {
  return { id: SESSION, title: "Errors", updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" };
}

function record(): SessionRecord {
  return {
    meta: { schemaVersion: 2, id: SESSION, title: "Errors", createdAt: NOW, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
    events: [{ id: "v2-0", schemaVersion: 2, sessionId: SESSION, agentRunId: "run-0", type: "user_message", timestamp: NOW, payload: { content: "hello errors" } }],
  };
}

const emptySnapshot = (revision = 1): TaskSnapshot => ({ sessionId: SESSION, revision, paused: false, tasks: [], queue: [], runs: [] });

function fixture(handlers: Record<string, unknown> = {}) {
  const live = new Set<(payload: unknown) => void>();
  setupBridge({
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, items: [{ id: "default", kind: "folder", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: NOW, updatedAt: NOW }] }),
    "sessions.list": async () => [listItem()],
    "sessions.listPage": async () => ({ items: [listItem()], groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }),
    "sessions.getPage": async () => recordProjectionFixture(record()),
    "approvals.listPending": async () => [],
    "tasks.command": async () => ({ snapshot: emptySnapshot() }),
    "events.sessionLive": (callback: (payload: unknown) => void) => { const entry = (payload: unknown) => callback(payload); live.add(entry); return () => { live.delete(entry); }; },
    "review.getSnapshot": async () => ({ ok: false, code: "not_available", message: "No changes" }),
    "visualize.list": async () => ({ items: [] }),
    ...handlers,
  });
  const emit = (event: Record<string, unknown>) => act(async () => { for (const listener of live) listener({ event, emittedAt: NOW }); await Promise.resolve(); });
  return { emit };
}

function renderApp() {
  return render(<TooltipProvider><App /></TooltipProvider>);
}

describe("session errors are visible", () => {
  it("shows the error with a retry button when opening a local session fails, and recovers on retry", async () => {
    let fail = true;
    const page = vi.fn(async () => { if (fail) throw new Error("internal failure"); return recordProjectionFixture(record()); });
    fixture({ "sessions.getPage": page });
    renderApp();
    const alert = await screen.findByRole("alert");
    // 本地会话的读取错误原样显示（远端会话的错误由 host-feedback 用例覆盖改写）。
    expect(alert).toHaveTextContent("internal failure");
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "重试" }));
    expect(await screen.findByText("hello errors")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(page.mock.calls.length).toBeGreaterThan(1);
  });

  it("surfaces a failed projection resync on the open session and clears it once a retry succeeds", async () => {
    let fail = true;
    const snapshot = vi.fn(async () => { if (fail) throw new Error("Host 不可用"); return recordProjectionFixture(record()); });
    const { emit } = fixture({ "sessions.getProjectionSnapshot": snapshot });
    renderApp();
    expect(await screen.findByText("hello errors")).toBeInTheDocument();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await emit({ kind: "resync-required", schemaVersion: 1, runtimeInstanceId: "rt", liveSeq: 1, throughJournalSeq: 0, sessionId: SESSION });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("会话同步失败：Host 不可用");
    // 正文还在，只是在上方提示。
    expect(screen.getByText("hello errors")).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    error.mockRestore();
  });

  it("tells the user when the task queue of the open session cannot be read", async () => {
    let fail = false;
    const { emit } = fixture({ "tasks.command": async () => { if (fail) throw new Error("IPC 断开"); return { snapshot: emptySnapshot() }; } });
    renderApp();
    expect(await screen.findByText("hello errors")).toBeInTheDocument();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fail = true;
    await emit({ kind: "runtime-live", schemaVersion: 1, runtimeInstanceId: "rt", liveSeq: 2, throughJournalSeq: 0, sessionId: SESSION, message: "task-queue-updated" });
    expect(await screen.findByText("队列状态读取失败，请稍后重试。")).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith("队列状态读取失败，请稍后重试。", expect.any(Error));
    error.mockRestore();
  });

  it("shows a corrupt-key error state instead of crashing when a session key cannot be decoded", async () => {
    // 15 T2：以 `host:` 开头但解不开的 key。main 会对它抛错；renderer 不在渲染中抛错，也不给「重试」。
    const corrupt = "host:not-a-locator";
    const item = { ...listItem(), id: corrupt, title: "Corrupt" };
    fixture({
      "sessions.list": async () => [item],
      "sessions.listPage": async () => ({ items: [item], groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }),
      "sessions.getPage": async () => { throw new Error("Invalid remote SessionRef"); },
      "tasks.command": async () => { throw new Error("Invalid remote SessionRef"); },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("会话标识损坏，无法打开这个会话。");
    expect(within(alert).queryByRole("button", { name: "重试" })).toBeNull();
    expect(screen.getAllByText("Corrupt").length).toBeGreaterThan(0);
  });
});
