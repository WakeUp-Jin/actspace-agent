import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { TestSidebar } from "./helpers/workbench";
import { setupBridge } from "./helpers/bridge";
import { SIDEBAR_VIEW_STORAGE_KEY } from "../components/sidebar/sidebar-view-store";

const NOW = Date.now();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function workspace(id: string, label: string, path: string, order: number): WorkspaceEntry {
  return { id, kind: "folder", label, path, order, createdAt: minutesAgo(0), updatedAt: minutesAgo(0) };
}

const WORKSPACES = [workspace("ws-a", "alpha", "/w/alpha", 0), workspace("ws-b", "beta", "/w/beta", 1)];

function session(id: string, title: string, root: string, minutes: number, extra: Partial<SessionListItem> = {}): SessionListItem {
  return { id, title, workspaceRoot: root, updatedAt: minutesAgo(minutes), agentRunCount: 1, ...extra };
}

const SESSIONS: SessionListItem[] = [
  // 相隔几秒，跨零点时也基本都落在「今天」。
  session("a1", "Alpha one", "/w/alpha", 0.01),
  session("a2", "Alpha two", "/w/alpha", 0.02),
  session("a3", "Alpha three", "/w/alpha", 0.03),
  session("b1", "Beta old", "/w/beta", 3 * 24 * 60),
  session("p1", "Pinned note", "/w/beta", 5, { pinned: true }),
];

function renderSidebar(overrides: Partial<Parameters<typeof TestSidebar>[0]> = {}) {
  const onRestoreSession = vi.fn();
  const view = render(
    <TestSidebar
      sessions={SESSIONS}
      workspaces={WORKSPACES}
      activeSessionId={null}
      mode="expanded"
      view="chat"
      onRestoreSession={onRestoreSession}
      {...overrides}
    />,
  );
  return { ...view, onRestoreSession };
}

function rowTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".session-row .session-row-title")).map((node) => node.textContent ?? "");
}

async function pickView(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^视图选项/ }));
  await user.click(await screen.findByRole("menuitemradio", { name: new RegExp(name) }));
  await user.keyboard("{Escape}");
}

function storedOptions() {
  return JSON.parse(localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY) ?? "{}").options;
}

describe("Sidebar views", () => {
  it("groups by time with 需要处理 first and disables manual sort", async () => {
    const { container } = renderSidebar({ sessionStatuses: { a2: "failed" } });
    await pickView("按时间");

    expect(screen.getByRole("button", { name: "会话" })).toBeInTheDocument();
    const attention = container.querySelector('[data-time-bucket="attention"]') as HTMLElement;
    expect(within(attention).getByText("需要处理")).toBeInTheDocument();
    expect(within(attention).getByText("Alpha two")).toBeInTheDocument();
    const today = container.querySelector('[data-time-bucket="today"]') as HTMLElement;
    expect(rowTitles(today)).toEqual(["Alpha one", "Alpha three"]);
    expect(container.querySelector('[data-time-bucket^="day-"]')).not.toBeNull();
    // 置顶的不进时间段。
    expect(within(today).queryByText("Pinned note")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^视图选项/ }));
    expect(await screen.findByRole("menuitemradio", { name: /手动排序/ })).toHaveAttribute("aria-disabled", "true");
    expect(storedOptions()).toMatchObject({ groupBy: "time" });
  });

  it("shows a single list with workspace names on each row", async () => {
    const { container } = renderSidebar();
    await pickView("单列表");

    const flat = container.querySelector('[data-group-key="flat"]') as HTMLElement;
    expect(rowTitles(flat)).toEqual(["Alpha one", "Alpha two", "Alpha three", "Beta old"]);
    expect(within(flat).getAllByText("alpha")).toHaveLength(3);
    expect(within(flat).getByText("beta")).toBeInTheDocument();
  });

  it("dragging a session switches to manual order and keeps the new order", async () => {
    const { container } = renderSidebar();
    const group = () => container.querySelector('[data-group-key="ws-a"]') as HTMLElement;
    const row = (id: string) => group().querySelector(`.session-row[data-session-id="${id}"]`) as HTMLElement;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };

    fireEvent.dragStart(row("a3"), { dataTransfer });
    fireEvent.dragOver(row("a1"), { dataTransfer, clientY: 0 });
    fireEvent.drop(row("a1"), { dataTransfer, clientY: 0 });

    expect(rowTitles(group())).toEqual(["Alpha three", "Alpha one", "Alpha two"]);
    expect(screen.getByRole("status")).toHaveTextContent("已切换为手动排序");
    expect(storedOptions()).toMatchObject({ sort: "manual" });
    expect(screen.getByRole("button", { name: "视图选项（已改动）" })).toBeInTheDocument();
  });

  it("does not drop a session into another workspace", () => {
    const { container } = renderSidebar();
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const a1 = container.querySelector('.session-row[data-session-id="a1"]') as HTMLElement;
    const b1 = container.querySelector('.session-row[data-session-id="b1"]') as HTMLElement;

    fireEvent.dragStart(a1, { dataTransfer });
    fireEvent.dragOver(b1, { dataTransfer, clientY: 0 });
    fireEvent.drop(b1, { dataTransfer, clientY: 0 });

    expect(storedOptions()).toBeUndefined();
    expect(rowTitles(container.querySelector('[data-group-key="ws-b"]') as HTMLElement)).toEqual(["Beta old"]);
  });

  it("searches from the header icon and closes on Escape", async () => {
    const listPage = vi.fn(async (input?: { search?: string }) => ({
      items: input?.search ? [session("b1", "Beta old", "/w/beta", 10)] : [],
      groups: [],
      indexing: false,
      failed: 0,
    }));
    setupBridge({ "sessions.listPage": listPage });
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.queryByRole("button", { name: "搜索本机会话" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索会话" }));
    const input = screen.getByRole("textbox", { name: "搜索会话标题和片段" });
    await user.type(input, "beta");

    const results = await screen.findByLabelText("会话搜索结果");
    expect(await within(results).findByText("Beta old")).toBeInTheDocument();
    expect(listPage).toHaveBeenCalledWith(expect.objectContaining({ search: "beta" }));
    expect(screen.queryByText("Alpha one")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "搜索会话标题和片段" })).not.toBeInTheDocument();
    expect(screen.getByText("Alpha one")).toBeInTheDocument();
  });

  it("shows archived sessions in their workspace with a restore action", async () => {
    setupBridge({
      "sessions.list": async (input?: { archived?: boolean }) => input?.archived
        ? [session("x1", "Archived alpha", "/w/alpha", 30, { archived: true }), session("x2", "Removed workspace", "/w/gone", 30, { archived: true })]
        : [],
    });
    const { onRestoreSession } = renderSidebar();
    await pickView("全部对话");

    const row = (await screen.findByText("Archived alpha")).closest(".session-row") as HTMLElement;
    expect(within(row).getByText("已归档")).toBeInTheDocument();
    // 已移除的工作区不因为已归档会话重新出现。
    expect(screen.queryByText("Removed workspace")).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "取消归档" }));
    expect(onRestoreSession).toHaveBeenCalledWith("x1");
  });

  it("仅显示已归档 with nothing archived offers a way back", async () => {
    setupBridge({ "sessions.list": async () => [] });
    renderSidebar();
    await pickView("仅显示已归档");

    expect(await screen.findByText("暂无已归档会话")).toBeInTheDocument();
    expect(screen.queryByText("已置顶")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "查看其他会话" }));
    expect(screen.getByText("Alpha one")).toBeInTheDocument();
    expect(storedOptions()).toMatchObject({ archived: "hide" });
  });

  it("remembers a collapsed workspace across remounts", async () => {
    const first = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "alpha" }));
    expect(screen.queryByText("Alpha one")).not.toBeInTheDocument();
    first.unmount();

    renderSidebar();
    expect(screen.getByRole("button", { name: "alpha" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Alpha one")).not.toBeInTheDocument();
  });

  it("恢复默认 resets options but keeps collapse state", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "beta" }));
    await pickView("单列表");
    await userEvent.click(screen.getByRole("button", { name: /^视图选项/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "恢复默认" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "工作区" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "beta" })).toHaveAttribute("aria-expanded", "false");
  });
});


it("restores search focus on explicit close but respects outside focus", async () => {
  renderSidebar();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "搜索会话" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "关闭搜索" }));
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  const outside = screen.getByRole("button", { name: "已置顶" });
  await user.click(outside);
  expect(outside).toHaveFocus();
  expect(screen.queryByRole("search")).not.toBeInTheDocument();
});
