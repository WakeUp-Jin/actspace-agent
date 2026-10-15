import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as shared from "@actspace/shared";
import type { SessionEvent, SessionListItem, SessionRecord } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";
import { SIDEBAR_VIEW_STORAGE_KEY } from "../components/sidebar/sidebar-view-store";
import { recordProjectionFixture } from "./projection-fixture";

// 14 T0：会话数据流的 IPC 与投影预算。T0 只记录基线；T3 起断言审批 / 队列补齐只按新增会话 id 发生，T10 起断言投影次数
// （T0 → T10：mount100 5 → 4，open2000 5 → 5，earlier10 30 → 10，即每页一次）。
// `createMessageBlocks` 的计数经 vi.mock 拦截 `@actspace/shared` 的导出，覆盖 App 与
// renderer/api/sessions.ts 的调用；@actspace/client 内部的调用是否计入，以首次运行结果为准（见执行记录）。
vi.mock("@actspace/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof shared>();
  return { ...actual, createMessageBlocks: vi.fn(actual.createMessageBlocks) };
});

const createMessageBlocks = vi.mocked(shared.createMessageBlocks);
const budget: Record<string, Record<string, number>> = {};
afterAll(() => {
  console.info(`[session-ipc-budget] ${JSON.stringify(budget)}`);
});

const NOW = "2026-10-06T00:00:00.000Z";
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

function counter() {
  const counts = { listPending: 0, taskCommand: 0, getPage: 0 };
  return {
    counts,
    snapshot: () => ({ ...counts, createMessageBlocks: createMessageBlocks.mock.calls.length }),
  };
}

function listItem(index: number): SessionListItem {
  return { id: `s-${index}`, title: `Session ${index}`, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" };
}

function eventsRecord(id: string, events: SessionEvent[], title = id): SessionRecord {
  return { meta: { schemaVersion: 2, id, title, createdAt: NOW, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" }, events };
}

function message(sessionId: string, seq: number, type: "user_message" | "assistant_message", content: string): SessionEvent {
  return { id: `v2-${seq}`, schemaVersion: 2, sessionId, agentRunId: `run-${Math.floor(seq / 2)}`, type, timestamp: NOW, payload: { content } };
}

function install(input: { items: SessionListItem[]; page: (args: { sessionId: string; beforeSeq?: number }) => unknown; listPage?: (args?: { after?: string }) => unknown }) {
  const c = counter();
  setupBridge({
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, items: [{ id: "default", kind: "folder", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: NOW, updatedAt: NOW }] }),
    "sessions.list": async () => input.items,
    "sessions.listPage": async (args?: { after?: string }) => input.listPage?.(args) ?? ({ items: input.items, groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }),
    "sessions.rename": async () => ({ ok: true }),
    "sessions.getPage": async (args: { sessionId: string; beforeSeq?: number }) => { c.counts.getPage++; return input.page(args); },
    "approvals.listPending": async () => { c.counts.listPending++; return []; },
    "tasks.command": async (command: { sessionId: string }) => {
      c.counts.taskCommand++;
      return { snapshot: { sessionId: command.sessionId, revision: 1, paused: false, tasks: [], queue: [], runs: [] } };
    },
    "review.getSnapshot": async () => ({ ok: false, code: "not_available", message: "No changes" }),
    "visualize.list": async () => ({ items: [] }),
  });
  createMessageBlocks.mockClear();
  return c;
}

function renderApp() {
  return render(<TooltipProvider><App /></TooltipProvider>);
}

describe("session IPC budget", () => {
  // 预算按「侧栏行全部挂上」来量：单列表不折叠，按工作区分组每组只先显示 5 条。
  beforeEach(() => { localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, JSON.stringify({ options: { groupBy: "flat" } })); });
  it("catalog rows without pending tasks do not recover background history", async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...listItem(index), hasPendingTasks: false }));
    const c = install({ items, page: ({ sessionId }) => recordProjectionFixture(eventsRecord(sessionId, [])) });
    renderApp();
    await waitFor(() => expect(document.querySelectorAll(".session-row")).toHaveLength(20));
    await settle();
    expect(c.counts.listPending).toBeGreaterThanOrEqual(20);
    expect(c.counts.taskCommand).toBeLessThanOrEqual(3);
  });
  it("100 sessions: mount, then rename one title", { timeout: 30_000 }, async () => {
    const items = Array.from({ length: 100 }, (_, index) => listItem(index));
    const c = install({ items, page: ({ sessionId }) => recordProjectionFixture(eventsRecord(sessionId, [message(sessionId, 0, "user_message", `hello ${sessionId}`)])) });
    renderApp();
    await waitFor(() => expect(document.querySelectorAll(".session-row")).toHaveLength(100), { timeout: 10_000 });
    await waitFor(() => expect(c.counts.listPending).toBeGreaterThan(0));
    await settle();
    const mounted = c.snapshot();

    const row = document.querySelector<HTMLElement>('.session-row[data-session-id="s-5"]');
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!, { clientX: 120, clientY: 80 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const textbox = screen.getByRole("textbox", { name: /重命名会话/ });
    await user.clear(textbox);
    await user.type(textbox, "Renamed{Enter}");
    await settle();
    const renamed = c.snapshot();

    budget.mount100 = mounted;
    expect(mounted.createMessageBlocks).toBeLessThanOrEqual(4);
    budget.rename = Object.fromEntries(Object.entries(renamed).map(([key, value]) => [key, value - mounted[key as keyof typeof mounted]]));
    expect(budget.rename).toMatchObject({ listPending: 0, taskCommand: 0 });
  });

  it("loading one more sidebar page of M sessions hydrates exactly those M", { timeout: 30_000 }, async () => {
    const M = 15;
    const first = Array.from({ length: 20 }, (_, index) => listItem(index));
    const second = Array.from({ length: M }, (_, index) => ({ ...listItem(20 + index), updatedAt: "2026-10-05T00:00:00.000Z" }));
    const c = install({
      items: first,
      page: ({ sessionId }) => recordProjectionFixture(eventsRecord(sessionId, [message(sessionId, 0, "user_message", `hello ${sessionId}`)])),
      listPage: (args) => args?.after
        ? { items: second, groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }
        : { items: first, groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: true }], indexing: false, failed: 0 },
    });
    renderApp();
    await waitFor(() => expect(document.querySelectorAll(".session-row")).toHaveLength(20), { timeout: 10_000 });
    await settle();
    const before = c.snapshot();
    await userEvent.setup().click(screen.getByRole("button", { name: "加载更多会话" }));
    await waitFor(() => expect(document.querySelectorAll(".session-row")).toHaveLength(20 + M));
    await settle();
    const after = c.snapshot();
    budget.morePage = Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key as keyof typeof before]]));
    expect(budget.morePage).toMatchObject({ listPending: M, taskCommand: M });
  });

  it("one session with 2000 events: open", { timeout: 30_000 }, async () => {
    const events = Array.from({ length: 2000 }, (_, seq) => message("big", seq, seq % 2 === 0 ? "user_message" : "assistant_message", `message ${seq}`));
    const c = install({ items: [listItem(0), { ...listItem(1), id: "big", title: "Big session" }], page: ({ sessionId }) => recordProjectionFixture(eventsRecord(sessionId, sessionId === "big" ? events : [message(sessionId, 0, "user_message", "hello")])) });
    renderApp();
    await screen.findByText("Big session");
    await settle();
    const before = c.snapshot();
    await userEvent.setup().click(screen.getByText("Big session"));
    await screen.findByText("message 1999");
    await settle();
    const after = c.snapshot();
    budget.open2000 = Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key as keyof typeof before]]));
    expect(budget.open2000.createMessageBlocks).toBeLessThanOrEqual(5);
  });

  it("load 10 pages of earlier history", { timeout: 30_000 }, async () => {
    const PAGES = 11; // 最新一页 + 10 页早期历史
    const pageFor = (index: number) => {
      const seq = (PAGES - 1 - index) * 10;
      const record = eventsRecord("paged", [message("paged", seq, "user_message", `Question ${index}`)], "Paged session");
      const base = recordProjectionFixture(record);
      const events = base.window.events.map((event) => ({ ...event, seq }));
      const beforeSeq = index === PAGES - 1 ? null : seq;
      return {
        ...base,
        throughJournalSeq: (PAGES - 1) * 10,
        snapshot: { ...base.snapshot, throughJournalSeq: (PAGES - 1) * 10 },
        window: { ...base.window, events, fromSeq: seq, throughJournalSeq: index === 0 ? (PAGES - 1) * 10 : seq + 9, beforeSeq },
      };
    };
    const c = install({
      items: [{ ...listItem(0), id: "paged", title: "Paged session" }],
      page: ({ beforeSeq }) => pageFor(beforeSeq === undefined ? 0 : PAGES - 1 - beforeSeq / 10 + 1),
    });
    renderApp();
    await screen.findByText("Question 0");
    await settle();
    const before = c.snapshot();
    for (let index = 1; index < PAGES; index++) {
      fireEvent.wheel(screen.getByLabelText("会话消息"), { deltaY: -120 });
      await screen.findByText(`Question ${index}`);
      await settle();
    }
    const after = c.snapshot();
    budget.earlier10 = Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key as keyof typeof before]]));
    // 每加载一页只投影一次：durable 块从 cell 派生，不再手工合并后重算。
    expect(budget.earlier10.createMessageBlocks).toBeLessThanOrEqual(PAGES - 1);
  });
});
