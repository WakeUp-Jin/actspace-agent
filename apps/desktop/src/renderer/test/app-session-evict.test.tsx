import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SessionListItem, SessionRecord } from "@actspace/shared";
import type { TaskRecord, TaskSnapshot } from "@actspace/shared/runtime-v2";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";
import { recordProjectionFixture } from "./projection-fixture";

// 14 T7：归档后释放按会话的本地状态；运行中的会话等 run 结束再释放。
const NOW = "2026-10-06T00:00:00.000Z";

function listItem(id: string, title: string): SessionListItem {
  return { id, title, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" };
}

function record(id: string, title: string): SessionRecord {
  return {
    meta: { schemaVersion: 2, id, title, createdAt: NOW, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
    events: [{ id: `v2-${id}`, schemaVersion: 2, sessionId: id, agentRunId: `run-${id}`, type: "user_message", timestamp: NOW, payload: { content: `hello ${id}` } }],
  };
}

function task(taskId: string, content: string, state: TaskRecord["state"], runId: string | null = null): TaskRecord {
  return { taskId, submissionId: `sub-${taskId}`, content, acceptedSeq: 1, state, targetRunId: null, runId, continuationOf: null };
}

function fixture() {
  const items = [listItem("s-1", "First"), listItem("s-2", "Second")];
  const archived = new Set<string>();
  const snapshots = new Map<string, TaskSnapshot>();
  const empty = (sessionId: string, revision = 1): TaskSnapshot => ({ sessionId, revision, paused: false, tasks: [], queue: [], runs: [] });
  const live = new Set<(payload: unknown) => void>();
  const holds = new Map<string, Promise<void>>();
  setupBridge({
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, items: [{ id: "default", kind: "folder", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: NOW, updatedAt: NOW }] }),
    "sessions.list": async () => items.filter((item) => !archived.has(item.id)),
    "sessions.listPage": async () => ({ items: items.filter((item) => !archived.has(item.id)), groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }),
    "sessions.archive": async ({ sessionId }: { sessionId: string }) => { archived.add(sessionId); return { ok: true }; },
    "sessions.getPage": async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(record(sessionId, items.find((item) => item.id === sessionId)!.title)),
    "approvals.listPending": async () => [],
    "tasks.command": async (command: { sessionId: string }) => {
      await holds.get(command.sessionId);
      return { snapshot: snapshots.get(command.sessionId) ?? empty(command.sessionId) };
    },
    "tasks.submit": async () => ({ status: "submission-failed", acknowledgement: "rejected", message: "提交被拒绝" }),
    // 每次订阅单独计数，同一个函数订阅两次也算两个。
    "events.sessionLive": (callback: (payload: unknown) => void) => { const entry = (payload: unknown) => callback(payload); live.add(entry); return () => { live.delete(entry); }; },
    "review.getSnapshot": async () => ({ ok: false, code: "not_available", message: "No changes" }),
    "visualize.list": async () => ({ items: [] }),
  });
  const emit = (sessionId: string, message: string) => act(() => { for (const listener of live) listener({ event: { sessionId, message } }); });
  return {
    live,
    snapshots,
    empty,
    unarchive: async (sessionId: string) => { archived.delete(sessionId); await emit(sessionId, "session-title-updated"); },
    pushSnapshot: (snapshot: TaskSnapshot) => { snapshots.set(snapshot.sessionId, snapshot); return emit(snapshot.sessionId, "task-queue-updated"); },
    /** 让这个会话的快照请求先挂起，返回的函数放行。 */
    hold: (sessionId: string) => {
      let release!: () => void;
      holds.set(sessionId, new Promise<void>((resolve) => { release = resolve; }));
      return () => act(async () => { holds.delete(sessionId); release(); await Promise.resolve(); });
    },
  };
}

const row = (id: string) => document.querySelector<HTMLElement>(`.session-row[data-session-id="${id}"]`);

async function open(id: string, title: string) {
  await waitFor(() => expect(row(id)).not.toBeNull());
  await userEvent.setup().click(within(row(id)!).getByText(title));
  await waitFor(() => expect(row(id)!.className).toMatch(/active|selected/));
}

async function leaveRejectedDraft(text: string) {
  const user = userEvent.setup();
  const textbox = screen.getByRole("textbox", { name: /消息|输入/ });
  await user.click(textbox);
  await user.type(textbox, `${text}{Enter}`);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("提交被拒绝"));
  expect(textbox).toHaveValue(text);
}

async function archive(id: string) {
  fireEvent.click(within(row(id)!).getByRole("button", { name: "归档会话" }));
  await waitFor(() => expect(row(id)).toBeNull());
  await act(async () => {});
}

function renderApp() {
  return render(<TooltipProvider><App /></TooltipProvider>);
}

// 14 T17：任务队列、侧栏标题和会话投影三处都挂在同一个分发器上。
describe("live event subscription", () => {
  it("holds a single bridge subscription for the whole app and releases it on unmount", async () => {
    const f = fixture();
    const { unmount } = renderApp();
    await open("s-1", "First");
    expect(f.live.size).toBe(1);
    await open("s-2", "Second");
    expect(f.live.size).toBe(1);
    unmount();
    expect(f.live.size).toBe(0);
  });
});

describe("evicting session-local state", () => {
  it("drops the draft and queue of an archived session, so unarchiving opens it clean", { timeout: 15_000 }, async () => {
    const f = fixture();
    f.snapshots.set("s-2", { ...f.empty("s-2"), tasks: [task("t-queued", "排队消息", "pending")], queue: ["t-queued"] });
    renderApp();
    await open("s-2", "Second");
    await screen.findByText("排队消息");
    await leaveRejectedDraft("草稿正文");

    await open("s-1", "First");
    expect(screen.getByRole("textbox", { name: /消息|输入/ })).toHaveValue("");
    f.snapshots.set("s-2", f.empty("s-2", 2));
    await archive("s-2");

    await f.unarchive("s-2");
    await open("s-2", "Second");
    await act(async () => {});
    expect(screen.getByRole("textbox", { name: /消息|输入/ })).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("排队消息")).toBeNull();
  });

  it("keeps a running session's live state through archive, and evicts once its run ends", { timeout: 15_000 }, async () => {
    const f = fixture();
    const running: TaskSnapshot = {
      ...f.empty("s-2"),
      tasks: [task("t-bg", "后台任务", "claimed", "run-bg")],
      runs: [{ runId: "run-bg", taskId: "t-bg", harness: { id: "actspace", version: "test" } as never, configuration: {}, state: "running", result: null }],
    };
    f.snapshots.set("s-2", running);
    renderApp();
    await open("s-2", "Second");
    await screen.findByText("后台任务");
    await leaveRejectedDraft("运行中的草稿");

    // 运行中归档：本地状态不释放，取消归档再打开时，流式内容和草稿都还在。
    await open("s-1", "First");
    await archive("s-2");
    await f.unarchive("s-2");
    await open("s-2", "Second");
    expect(screen.getByText("后台任务")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /消息|输入/ })).toHaveValue("运行中的草稿"));

    // 再次在运行中归档，然后 run 结束：此时才释放。
    await open("s-1", "First");
    await archive("s-2");
    await f.pushSnapshot({ ...running, revision: 2, tasks: [task("t-bg", "后台任务", "completed", "run-bg")], runs: [{ ...running.runs[0], state: "completed" }] });
    await act(async () => {});
    await f.unarchive("s-2");
    await open("s-2", "Second");
    await act(async () => {});
    expect(screen.getByRole("textbox", { name: /消息|输入/ })).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // 复核发现：归档前发出、归档后才回来的快照不能把已释放的队列重新建出来。
  it("drops a task snapshot that was requested before the session was evicted", { timeout: 15_000 }, async () => {
    const f = fixture();
    renderApp();
    await open("s-1", "First");
    const release = f.hold("s-2");
    await f.pushSnapshot({ ...f.empty("s-2", 5), tasks: [task("t-late", "迟到的排队", "pending")], queue: ["t-late"] });
    await archive("s-2");
    await release();
    await act(async () => {});
    f.snapshots.set("s-2", f.empty("s-2", 1));
    await f.unarchive("s-2");
    await open("s-2", "Second");
    await act(async () => {});
    expect(screen.queryByText("迟到的排队")).toBeNull();
  });
});
