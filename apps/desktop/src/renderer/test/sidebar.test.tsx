import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContextUsageSnapshot, SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { TestSidebar } from "./helpers/workbench";
import { WindowChromeBar } from "../components/WindowChromeBar";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";

function makeSession(partial: Partial<SessionListItem> & Pick<SessionListItem, "id" | "title">): SessionListItem {
  return {
    updatedAt: "2026-07-29T00:00:00.000Z",
    agentRunCount: 1,
    ...partial,
  };
}

const SESSIONS: SessionListItem[] = [
  makeSession({
    id: "s-pinned-1",
    title: "Bash 工具开发与权限调度",
    workspaceRoot: "/Users/me/projects/actspace-agent",
    pinned: true,
  }),
  makeSession({
    id: "s-actspace-1",
    title: "工具定义格式和命名规范",
    workspaceRoot: "/Users/me/projects/actspace-agent",
  }),
  makeSession({
    id: "s-actspace-2",
    title: "Conversation context lookup",
    workspaceRoot: "/Users/me/projects/actspace-agent",
  }),
  makeSession({
    id: "s-harness-1",
    title: "README file improvement",
    workspaceRoot: "/Users/me/projects/agent-harness-dev",
  }),
];

const HOVER_CONTEXT: ContextUsageSnapshot = {
  cumulativeTokens: 315000,
  totalTokens: 56_000,
  maxTokens: 100_000,
  percentUsed: 56,
  buckets: [{ key: "conversation", tokens: 56_000 }],
};

const WORKSPACES: WorkspaceEntry[] = [
  {
    id: "default",
    kind: "default",
    label: "Default workspace",
    path: "/Users/me/Downloads",
    order: 0,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
  {
    id: "ws-actspace",
    kind: "folder",
    label: "actspace-agent",
    path: "/Users/me/projects/actspace-agent",
    order: 1,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
  {
    id: "ws-harness",
    kind: "folder",
    label: "agent-harness-dev",
    path: "/Users/me/projects/agent-harness-dev",
    order: 2,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
];

function renderSidebar(overrides: Partial<Parameters<typeof TestSidebar>[0]> = {}) {
  const onNewSession = vi.fn();
  const onSelectSession = vi.fn();
  const onTogglePin = vi.fn();
  const onSelectView = vi.fn();
  const onRename = vi.fn();
  const onArchive = vi.fn();
  const onCopySessionId = vi.fn();
  const onCopyTranscript = vi.fn();
  const onFork = vi.fn();
  const onOpenWorkspace = vi.fn();
  const onArchiveWorkspace = vi.fn();
  const onRemoveWorkspace = vi.fn();

  const result = render(
    <TooltipProvider delayDuration={0}>
      <TestSidebar
        sessions={SESSIONS}
        workspaces={WORKSPACES}
        activeSessionId={null}
        mode="expanded"
        view="chat"
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
        onTogglePin={onTogglePin}
        onSelectView={onSelectView}
        onRename={onRename}
        onArchive={onArchive}
        onCopySessionId={onCopySessionId}
        onCopyTranscript={onCopyTranscript}
        onFork={onFork}
        onOpenWorkspace={onOpenWorkspace}
        onArchiveWorkspace={onArchiveWorkspace}
        onRemoveWorkspace={onRemoveWorkspace}
        {...overrides}
      />
    </TooltipProvider>,
  );

  return {
    onNewSession,
    onSelectSession,
    onTogglePin,
    onSelectView,
    onRename,
    onArchive,
    onCopySessionId,
    onCopyTranscript,
    onFork,
    onOpenWorkspace,
    onArchiveWorkspace,
    onRemoveWorkspace,
    ...result,
  };
}

describe("Sidebar (cursor-aligned layout)", () => {
  it("renders the stable primary actions", () => {
    renderSidebar();

    expect(screen.getByText("新建会话")).toBeInTheDocument();
    expect(screen.queryByText("Lab")).not.toBeInTheDocument();
    expect(screen.queryByText("Usage")).not.toBeInTheDocument();
    expect(screen.getByText("⌘N")).toBeInTheDocument();
  });

  it("does not render the unavailable Scheduled section", () => {
    renderSidebar();

    expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();
    expect(screen.queryByText("No scheduled tasks")).not.toBeInTheDocument();
  });

  it("renders a Workspaces parent section above the workspace folders", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: /^工作区$/ })).toBeInTheDocument();
    // Workspace folders 在 Workspaces 父级下方仍可见
    expect(screen.getByText("actspace-agent")).toBeInTheDocument();
    expect(screen.getByText("agent-harness-dev")).toBeInTheDocument();
  });

  it("opens the workspace menu only from right click and invokes its actions", async () => {
    const user = userEvent.setup();
    const { onOpenWorkspace, onArchiveWorkspace, onRemoveWorkspace } = renderSidebar();
    const workspaceLabel = screen.getByRole("button", { name: "actspace-agent" });

    await user.click(workspaceLabel);
    expect(screen.queryByRole("menu", { name: "工作区操作： actspace-agent" })).not.toBeInTheDocument();

    fireEvent.contextMenu(workspaceLabel, { clientX: 24, clientY: 60 });
    expect(screen.getByRole("menu", { name: "工作区操作： actspace-agent" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "在 IDE 中打开" }));
    expect(onOpenWorkspace).toHaveBeenCalledWith("ws-actspace");

    fireEvent.contextMenu(workspaceLabel, { clientX: 24, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "归档全部" }));
    expect(onArchiveWorkspace).toHaveBeenCalledWith("ws-actspace", "/Users/me/projects/actspace-agent");

    fireEvent.contextMenu(workspaceLabel, { clientX: 24, clientY: 60 });
    await user.click(screen.getByRole("menuitem", { name: "从侧栏移除" }));
    expect(onRemoveWorkspace).toHaveBeenCalledWith("ws-actspace", "/Users/me/projects/actspace-agent");
  });

  it("keeps a keyboard context-menu entry point and returns focus to the workspace label", async () => {
    const user = userEvent.setup();
    const { onOpenWorkspace } = renderSidebar();
    const workspaceLabel = screen.getByRole("button", { name: "actspace-agent" });

    fireEvent.keyDown(workspaceLabel, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu", { name: "工作区操作： actspace-agent" })).toBeInTheDocument();
    expect(workspaceLabel).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(workspaceLabel).toHaveFocus());

    workspaceLabel.focus();
    await user.keyboard("{ContextMenu}");
    // 键盘打开时焦点落在第一项上。
    expect(screen.getByRole("menuitem", { name: "在 IDE 中打开" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpenWorkspace).toHaveBeenCalledWith("ws-actspace");
    await waitFor(() => expect(workspaceLabel).toHaveFocus());

    // 点外面关闭的不还焦点。
    const outside = screen.getByRole("button", { name: "收起 actspace-agent" });
    fireEvent.contextMenu(workspaceLabel, { clientX: 24, clientY: 60 });
    await user.click(outside);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(workspaceLabel).not.toHaveFocus();
  });

  it("keeps the chevron dedicated to collapse and disables default workspace removal", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "收起 actspace-agent" }));
    expect(screen.queryByText("Conversation context lookup")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "工作区操作： actspace-agent" })).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: "Default workspace" }), { clientX: 24, clientY: 60 });
    expect(screen.getByRole("menuitem", { name: "从侧栏移除" })).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the session list on vertical scrolling only", () => {
    const { container } = renderSidebar();

    expect(screen.getByRole("navigation", { name: "会话" })).toHaveClass(
      "sidebar-scrollbar",
      "overflow-x-hidden",
      "overflow-y-auto",
    );
    expect(container.querySelector("aside.sidebar")).not.toHaveClass("border-r");
  });

  it("collapses all workspace folders when the Workspaces parent is toggled", async () => {
    renderSidebar();

    expect(screen.getByText("actspace-agent")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^工作区$/ }));
    expect(screen.queryByText("actspace-agent")).not.toBeInTheDocument();
    expect(screen.queryByText("agent-harness-dev")).not.toBeInTheDocument();
  });

  it("shows a Pinned section when any session is pinned", () => {
    renderSidebar();
    expect(screen.getByText("已置顶")).toBeInTheDocument();
    expect(screen.getByText("Bash 工具开发与权限调度")).toBeInTheDocument();
  });

  it("invokes onTogglePin with the next pinned value when clicking the pin icon", async () => {
    const { onTogglePin } = renderSidebar();

    const pinButtons = screen.getAllByRole("button", { name: "置顶会话" });
    expect(pinButtons.length).toBeGreaterThan(0);
    await userEvent.click(pinButtons[0]);

    expect(onTogglePin).toHaveBeenCalledWith("s-actspace-1", true);
  });

  it("invokes onArchive when clicking the archive button on a session row", async () => {
    const { onArchive } = renderSidebar();

    const archiveButtons = screen.getAllByRole("button", { name: "归档会话" });
    expect(archiveButtons.length).toBeGreaterThan(0);
    await userEvent.click(archiveButtons[0]);

    expect(onArchive).toHaveBeenCalled();
  });

  it("opens the session context menu and commits inline rename with Enter", async () => {
    const user = userEvent.setup();
    const { onRename } = renderSidebar();

    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });

    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = screen.getByRole("textbox", { name: "重命名会话 工具定义格式和命名规范" });
    await user.clear(input);
    await user.type(input, "重命名后的会话{Enter}");

    expect(onRename).toHaveBeenCalledWith("s-actspace-1", "重命名后的会话");
  });

  it("opens the session menu with Shift+F10 and keeps focus in the rename input", async () => {
    const user = userEvent.setup();
    const { onRename } = renderSidebar();
    const title = screen.getByRole("button", { name: /^工具定义格式和命名规范/ });
    title.focus();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    screen.getByRole("menu", { name: "会话操作： 工具定义格式和命名规范" });
    // 菜单开着时不叠一层会话标题提示。
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "置顶" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(title).toHaveFocus());

    await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "重命名" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const input = screen.getByRole("textbox", { name: "重命名会话 工具定义格式和命名规范" });
    // Radix 在 setTimeout(0) 里处理菜单关闭后的焦点，不能把焦点从输入框拿走。
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(input).toHaveFocus();
    await user.keyboard("{Control>}a{/Control}键盘改名{Enter}");
    expect(onRename).toHaveBeenCalledWith("s-actspace-1", "键盘改名");
  });

  it("returns focus to the session title after a keyboard rename ends, but not after a blur commit", async () => {
    const user = userEvent.setup();
    const { onRename } = renderSidebar();
    const startRename = async () => {
      screen.getByRole("button", { name: /^工具定义格式和命名规范/ }).focus();
      await user.keyboard("{Shift>}{F10}{/Shift}{ArrowDown}{Enter}");
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      return screen.getByRole("textbox", { name: "重命名会话 工具定义格式和命名规范" });
    };

    expect(await startRename()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: /^重命名会话/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^工具定义格式和命名规范/ })).toHaveFocus();
    expect(onRename).not.toHaveBeenCalled();

    await startRename();
    await user.keyboard("{Control>}a{/Control}回车改名{Enter}");
    expect(onRename).toHaveBeenCalledWith("s-actspace-1", "回车改名");
    expect(screen.getByRole("button", { name: /^工具定义格式和命名规范/ })).toHaveFocus();

    // 点别处失焦提交：焦点留在新点的地方。
    await startRename();
    await user.click(screen.getByRole("button", { name: "扩展" }));
    expect(screen.queryByRole("textbox", { name: /^重命名会话/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^工具定义格式和命名规范/ })).not.toHaveFocus();
  });

  it("keeps focus in the rename input when the menu was opened from a row action button", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row") as HTMLElement;
    // 行内操作按钮在改名后仍然在，菜单关闭时不能把焦点还给它（否则输入框失焦，改名直接提交）。
    const action = row.querySelector<HTMLButtonElement>(".session-row-actions button")!;
    action.focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.keyboard("{ArrowDown}{Enter}");
    const input = screen.getByRole("textbox", { name: "重命名会话 工具定义格式和命名规范" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(input).toHaveFocus();
    expect(action).toBeInTheDocument();
  });

  it("opens the Copy submenu and invokes Copy ID / Copy Transcript", async () => {
    const user = userEvent.setup();
    const { onCopySessionId, onCopyTranscript } = renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "复制" }));
    // 子菜单由 Radix 用 aria-labelledby 关联到「复制」。
    const submenu = await screen.findByRole("menu", { name: "复制" });
    // jsdom 里元素没有尺寸，Radix 判断不出指针正移向子菜单；子菜单项用键盘选。
    await user.keyboard("{ArrowRight}");
    expect(within(submenu).getByRole("menuitem", { name: "复制 ID" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onCopySessionId).toHaveBeenCalledWith("s-actspace-1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    await user.hover(screen.getByRole("menuitem", { name: "复制" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制会话记录" }));
    expect(onCopyTranscript).toHaveBeenCalledWith("s-actspace-1");
  });

  it("invokes Fork and disables it while the session is busy", async () => {
    const user = userEvent.setup();
    const first = renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "分叉" }));
    expect(first.onFork).toHaveBeenCalledWith("s-actspace-1");

    first.unmount();
    const busy = renderSidebar({ busySessionIds: new Set(["s-actspace-1"]) });
    const busyRow = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    fireEvent.contextMenu(busyRow as HTMLElement, { clientX: 120, clientY: 80 });
    const fork = screen.getByRole("menuitem", { name: "分叉" });
    expect(fork).toHaveAttribute("aria-disabled", "true");
    await user.click(fork);
    expect(busy.onFork).not.toHaveBeenCalled();
  });

  it("disables archive on the active session row", async () => {
    const { onArchive } = renderSidebar({ activeSessionId: "s-actspace-1" });

    const activeArchive = screen.getByRole("button", { name: "当前会话无法归档" });
    expect(activeArchive).toBeDisabled();
    await userEvent.click(activeArchive);

    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    const menuArchive = screen.getByRole("menuitem", { name: "归档" });
    expect(menuArchive).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(menuArchive);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("does not show the title tooltip while the row's menu is open", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row") as HTMLElement;
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 });
    // 指针移进菜单再回到行上：菜单没关，提示也不弹。
    await user.hover(screen.getByRole("menuitem", { name: "置顶" }));
    await user.hover(row);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.unhover(row);
    await user.hover(row);
    expect(await screen.findByRole("tooltip", {}, { timeout: 1000 })).toBeInTheDocument();
  });

  it("labels the pin item by the session's current pinned state", () => {
    renderSidebar();
    const pinnedRow = screen.getAllByText("Bash 工具开发与权限调度")[0]!.closest(".session-row");
    fireEvent.contextMenu(pinnedRow as HTMLElement, { clientX: 120, clientY: 80 });
    expect(screen.getByRole("menuitem", { name: "取消置顶" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "置顶" })).not.toBeInTheDocument();
  });

  it("switches back to the chat view when selecting a pinned or workspace session", async () => {
    const user = userEvent.setup();
    const { onSelectSession, onSelectView } = renderSidebar({ view: "settings" });

    await user.click(screen.getByRole("button", { name: /^Bash 工具开发与权限调度/ }));
    expect(onSelectView).toHaveBeenLastCalledWith("chat");
    expect(onSelectSession).toHaveBeenLastCalledWith("s-pinned-1");

    onSelectView.mockClear();
    await user.click(screen.getByRole("button", { name: /^README file improvement/ }));
    expect(onSelectView).toHaveBeenLastCalledWith("chat");
    expect(onSelectSession).toHaveBeenLastCalledWith("s-harness-1");
  });

  it("creates an Agent session directly from the workspace folder +", async () => {
    const { onNewSession, onSelectView } = renderSidebar({ view: "extensions" });

    const addButtons = screen.getAllByRole("button", { name: "在工作区中新建会话" });
    expect(addButtons.length).toBeGreaterThanOrEqual(2); // actspace-agent + agent-harness-dev
    await userEvent.click(addButtons[0]);

    expect(screen.queryByRole("menu", { name: /选择会话形态/ })).not.toBeInTheDocument();
    expect(onNewSession).toHaveBeenCalledWith(expect.objectContaining({ agentForm: "agent" }));
    expect(onSelectView).toHaveBeenCalledWith("chat");
  });

  it("shows See more when a workspace has more than 10 sessions and loads the next batch on click", async () => {
    const many: SessionListItem[] = Array.from({ length: 12 }, (_, idx) =>
      makeSession({
        id: `s-${idx}`,
        title: `Plan item ${idx}`,
        workspaceRoot: "/Users/me/projects/big-workspace",
        updatedAt: new Date(Date.UTC(2026, 7, 26, 0, 0, 12 - idx)).toISOString(),
      }),
    );

    renderSidebar({ sessions: many });

    expect(screen.queryByText("Plan item 0")).toBeInTheDocument();
    expect(screen.queryByText("Plan item 10")).not.toBeInTheDocument();

    const seeMore = screen.getByRole("button", { name: /^Show more/ });
    await userEvent.click(seeMore);

    expect(screen.getByText("Plan item 9")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("renders a status dot for the active session and a busy dot for busy sessions", () => {
    const { container } = renderSidebar({
      activeSessionId: "s-actspace-1",
      busySessionIds: new Set(["s-actspace-2"]),
    });

    const activeRow = container.querySelector('[data-group-key="actspace-agent"]') ?? container;
    expect(within(activeRow as HTMLElement).getByText("工具定义格式和命名规范").closest(".session-row")).toHaveClass(
      "is-active",
    );
    expect(within(activeRow as HTMLElement).getByText("Conversation context lookup").closest(".session-row")).toHaveClass(
      "is-busy",
    );
  });

  it("falls back to idle when a session status is unknown at runtime", () => {
    renderSidebar({
      sessions: [SESSIONS[1]],
      sessionStatuses: { "s-actspace-1": "paused_by_old_hmr" },
    });

    expect(screen.getByText("工具定义格式和命名规范")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "会话状态： 空闲" })).toBeInTheDocument();
  });

  it("shows the session status explanation in a popover that toggles, closes outside and on Esc (16 T16b)", async () => {
    const onSelectSession = vi.fn();
    renderSidebar({ onSelectSession });
    const user = userEvent.setup();
    const [statusButton] = screen.getAllByRole("button", { name: "会话状态： 空闲" });

    await user.click(statusButton!);
    const popover = await screen.findByRole("dialog", { name: "会话状态：空闲" });
    expect(popover).toHaveTextContent("空闲");
    expect(onSelectSession).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();
    expect(statusButton).toHaveFocus();

    await user.click(statusButton!);
    expect(await screen.findByRole("dialog", { name: "会话状态：空闲" })).toBeInTheDocument();
    // 再点一次按钮是关闭，不会先被当成点外面关掉、再被 onClick 打开。
    await user.click(statusButton!);
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();

    await user.click(statusButton!);
    expect(await screen.findByRole("dialog", { name: "会话状态：空闲" })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();

    // 触屏上 Radix 在按下时就判定「点外面」；按钮本身不算外面，所以点一下按钮仍是关闭，而不是关了又开。
    await user.click(statusButton!);
    expect(await screen.findByRole("dialog", { name: "会话状态：空闲" })).toBeInTheDocument();
    await user.pointer([{ keys: "[TouchA]", target: statusButton! }]);
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();
  });

  it("does not bring back the row tooltip after the status popover closes with the pointer elsewhere", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row") as HTMLElement;
    await user.hover(row);
    expect(await screen.findByRole("tooltip", {}, { timeout: 1000 })).toBeInTheDocument();

    const statusButton = within(row).getByRole("button", { name: "会话状态： 空闲" });
    await user.click(statusButton);
    expect(await screen.findByRole("dialog", { name: "会话状态：空闲" })).toBeInTheDocument();
    // 说明开着时指针离开了这一行（去点别处），说明关闭后行的悬停提示不应该再冒出来。
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not bring back the focus tooltip after a keyboard-opened menu or popover is dismissed elsewhere", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row") as HTMLElement;
    const title = screen.getByRole("button", { name: /^工具定义格式和命名规范/ });

    // 键盘打开右键菜单（没有 pointerdown 替我们关提示），再点别处关掉菜单。
    title.focus();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // 悬停出提示后用键盘打开状态说明，说明开着时指针离开这一行，再点别处关掉说明。
    await user.hover(row);
    expect(await screen.findByRole("tooltip", {}, { timeout: 1000 })).toBeInTheDocument();
    within(row).getByRole("button", { name: "会话状态： 空闲" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "会话状态：空闲" })).toBeInTheDocument();
    await user.unhover(row);
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // 键盘打开状态说明，同样点别处关掉。
    const statusButton = within(row).getByRole("button", { name: "会话状态： 空闲" });
    title.focus();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    statusButton.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "会话状态：空闲" })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "会话状态：空闲" })).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("collapses Pinned section when its label is clicked", async () => {
    renderSidebar();

    expect(screen.getByText("Bash 工具开发与权限调度")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^已置顶$/ }));
    expect(screen.queryByText("Bash 工具开发与权限调度")).not.toBeInTheDocument();
  });

  it("keeps one status dot on the left and places pin actions on the right", () => {
    const { container } = renderSidebar();

    const sessionRows = container.querySelectorAll(".session-row:not(.is-muted)");
    expect(sessionRows.length).toBeGreaterThan(0);
    sessionRows.forEach((row) => {
      expect(row.querySelectorAll(".session-status-dot")).toHaveLength(1);
      expect(row.querySelector(".session-row-marker .session-row-pin")).toBeNull();
      expect(row.querySelector(".session-row-actions .session-row-pin")).not.toBeNull();
    });
  });

  it("keeps time last and always visible while trailing actions stay hover-only", () => {
    const { container } = renderSidebar({ activeSessionId: "s-pinned-1" });
    const row = screen.getByText("Bash 工具开发与权限调度").closest(".session-row");
    expect(row).not.toBeNull();

    const children = Array.from((row as HTMLElement).children);
    const actions = row?.querySelector(".session-row-actions");
    const time = row?.querySelector(".session-row-time");
    expect(actions).not.toBeNull();
    expect(time).not.toBeNull();

    const pin = within(actions as HTMLElement).getByRole("button", { name: "取消置顶会话" });
    expect(children.indexOf(actions as Element)).toBeLessThan(children.indexOf(time as Element));
    expect(time).not.toHaveClass("opacity-0");
    expect(pin).not.toHaveClass("opacity-100");
    expect(container.querySelector(".session-row-actions + .session-row-time")).not.toBeNull();
  });

  it("shows the complete session title and workspace path on hover", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const title = screen.getByText("工具定义格式和命名规范");
    const row = title.closest(".session-row");
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("data-state", "closed");

    await user.hover(row as HTMLElement);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("工具定义格式和命名规范");
    expect(tooltip).toHaveTextContent("/Users/me/projects/actspace-agent");
    expect(row).not.toHaveAttribute("data-state", "closed");
  });

  it("closes the hover card while the context menu or rename input owns the row", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const title = screen.getByText("工具定义格式和命名规范");

    const row = title.closest(".session-row");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });

    expect(screen.getByRole("menu", { name: "会话操作： 工具定义格式和命名规范" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    expect(screen.getByRole("textbox", { name: "重命名会话 工具定义格式和命名规范" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("disables Archive all while any session of the workspace is busy, pinned ones included", () => {
    const archiveAll = (workspace: string) => {
      fireEvent.contextMenu(screen.getByRole("button", { name: workspace }), { clientX: 24, clientY: 60 });
      const item = screen.getByRole("menuitem", { name: "归档全部" });
      const disabled = item.getAttribute("aria-disabled") === "true";
      fireEvent.keyDown(item, { key: "Escape" });
      return disabled;
    };

    const { rerender } = renderSidebar({ busySessionIds: new Set(["s-pinned-1"]) });
    expect(archiveAll("actspace-agent")).toBe(true);
    expect(archiveAll("agent-harness-dev")).toBe(false);
    expect(archiveAll("Default workspace")).toBe(true);

    rerender(
      <TooltipProvider delayDuration={0}>
        <TestSidebar sessions={SESSIONS} workspaces={WORKSPACES} activeSessionId={null} mode="expanded" view="chat" onArchiveWorkspace={vi.fn()} sessionStatuses={{ "s-harness-1": "waiting_approval" }} />
      </TooltipProvider>,
    );
    expect(archiveAll("actspace-agent")).toBe(false);
    expect(archiveAll("agent-harness-dev")).toBe(true);
  });

  it("labels a remote workspace group with the host name from the host directory", async () => {
    setupBridge({
      "hosts.list": async () => [{ id: "c1", hostId: "h1", name: "新名", endpoint: { kind: "wss", url: "wss://example.test" }, state: "connected" }] as never,
    });
    renderSidebar({
      sessions: [makeSession({ id: "remote", title: "Remote", hostId: "h1", hostName: "旧名", connectionState: "connected", workspaceRoot: "/srv/app" })],
    });

    expect(screen.getByRole("button", { name: "旧名 · app" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "新名 · app" })).toBeInTheDocument();
  });

  it("renders nothing when mode is hidden", () => {
    const { container } = renderSidebar({ mode: "hidden" });

    expect(container.querySelector(".sidebar")).toBeNull();
  });
});

describe("WindowChromeBar", () => {
  function renderChromeBar(overrides: Partial<Parameters<typeof WindowChromeBar>[0]> = {}) {
    const onToggleLeft = vi.fn();
    const onToggleRight = vi.fn();
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();
    const result = render(
      <TooltipProvider delayDuration={0}>
        <WindowChromeBar
          leftMode="expanded"
          rightOpen={false}
          title="New chat"
          onToggleLeft={onToggleLeft}
          onToggleRight={onToggleRight}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          {...overrides}
        />
      </TooltipProvider>,
    );
    return { onToggleLeft, onToggleRight, onGoBack, onGoForward, ...result };
  }

  it("renders the left toggle, session navigation, and right toggle buttons + the title", () => {
    renderChromeBar({ title: "Workspace > New chat" });

    expect(screen.getByRole("button", { name: "收起会话侧栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "后退" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前进" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开面板" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workspace > New chat" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search sessions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Select workspace for next message" })).not.toBeInTheDocument();
  });

  it("renders the icon-only Chat / Trajectory toggle beside the session title", async () => {
    const user = userEvent.setup();
    const onToggleSessionView = vi.fn();
    renderChromeBar({ sessionView: "chat", onToggleSessionView });

    const toggle = screen.getByRole("button", { name: "查看执行轨迹" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("title", "查看执行轨迹");
    expect(screen.queryByText("Trajectory", { selector: "[role=tab]" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(onToggleSessionView).toHaveBeenCalledTimes(1);
  });

  it("uses the Chat icon label when the Trajectory view is active", () => {
    renderChromeBar({ sessionView: "trajectory", onToggleSessionView: vi.fn() });

    const toggle = screen.getByRole("button", { name: "返回对话" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("title", "返回对话");
  });

  it("aligns the chrome columns to the visible SplitView pane widths", () => {
    const { container } = renderChromeBar({
      leftPaneWidth: 280,
      rightPaneWidth: 420,
      rightOpen: true,
      centerTrailing: <span>center action</span>,
      rightLeading: <span>right action</span>,
    });

    const chrome = container.querySelector(".window-chrome-bar") as HTMLElement;
    expect(chrome.style.getPropertyValue("--window-chrome-left-column-width")).toBe("280px");
    expect(chrome.style.getPropertyValue("--window-chrome-right-column-width")).toBe("420px");
    expect(container.querySelector(".chrome-center-actions")).toHaveTextContent("center action");
    expect(container.querySelector(".chrome-right-actions")).toHaveTextContent("right action");
  });

  it("uses compact chrome edge columns instead of desktop pane widths in compact layout", () => {
    const { container } = renderChromeBar({
      leftPaneWidth: 280,
      rightPaneWidth: 420,
      rightOpen: true,
      compactLayout: true,
    });

    const chrome = container.querySelector(".window-chrome-bar") as HTMLElement;
    expect(chrome.getAttribute("data-compact-panel-open")).toBe("true");
    expect(chrome.style.getPropertyValue("--window-chrome-left-column-width")).toBe(
      "var(--window-chrome-collapsed-left-width)",
    );
    expect(chrome.style.getPropertyValue("--window-chrome-right-column-width")).toBe(
      "var(--window-chrome-collapsed-right-width)",
    );
  });

  it("flips the left toggle aria-label / aria-pressed when sidebar is hidden", () => {
    renderChromeBar({ leftMode: "hidden" });

    const left = screen.getByRole("button", { name: "展开会话侧栏" });
    expect(left).toBeInTheDocument();
    expect(left.getAttribute("aria-pressed")).toBe("false");
  });

  it("flips the right toggle aria-label / aria-pressed when right panel is open", () => {
    renderChromeBar({ rightOpen: true });

    const right = screen.getByRole("button", { name: "关闭面板" });
    expect(right).toBeInTheDocument();
    expect(right.getAttribute("aria-pressed")).toBe("true");
  });

  it("invokes the corresponding callbacks for left toggle, session navigation, and right toggle", async () => {
    const { onToggleLeft, onToggleRight, onGoBack, onGoForward } = renderChromeBar({
      canGoBack: true,
      canGoForward: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "收起会话侧栏" }));
    await userEvent.click(screen.getByRole("button", { name: "后退" }));
    await userEvent.click(screen.getByRole("button", { name: "前进" }));
    await userEvent.click(screen.getByRole("button", { name: "打开面板" }));

    expect(onToggleLeft).toHaveBeenCalledTimes(1);
    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).toHaveBeenCalledTimes(1);
    expect(onToggleRight).toHaveBeenCalledTimes(1);
  });

  it("disables session navigation when there is no history in that direction", () => {
    renderChromeBar();

    expect(screen.getByRole("button", { name: "后退" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "前进" })).toBeDisabled();
  });

  it("can hide the right toggle button for full-page views", () => {
    renderChromeBar({ showRightToggle: false });

    expect(screen.queryByRole("button", { name: "打开面板" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起会话侧栏" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search sessions" })).not.toBeInTheDocument();
  });

  it("shows full workspace path, model label, and context from the chrome title hover card", async () => {
    const user = userEvent.setup();
    const getSessionPreview = vi.fn(async () => ({
      sessionId: "s-actspace-1",
      workspaceRoot: "/Users/me/Desktop/code-project/side-project/actspace-agent",
      model: "deepseek-v4-pro",
      modelId: "deepseek-v4-pro" as const,
      contextSnapshot: HOVER_CONTEXT,
    }));
    renderChromeBar({
      title: "New chat",
      currentSession: SESSIONS[1],
      getSessionPreview,
    });

    await user.hover(screen.getByRole("button", { name: "查看会话详情： New chat" }));
    const tooltip = await screen.findByRole("tooltip");

    expect(getSessionPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "s-actspace-1" }));
    expect(tooltip).toHaveTextContent("New chat");
    expect(tooltip).toHaveTextContent("/Users/me/Desktop/code-project/side-project/actspace-agent");
    expect(tooltip).toHaveTextContent("deepseek-flash");
    expect(tooltip).toHaveTextContent(`累计 Token：${Math.floor(HOVER_CONTEXT.cumulativeTokens! / 1000)}K`);
    expect(tooltip).not.toHaveTextContent("上下文");
    expect(tooltip.querySelector("details")).toBeNull();
    expect(tooltip).not.toHaveTextContent("main");
  });

  it("shows the chrome title hover card from keyboard focus", async () => {
    const getSessionPreview = vi.fn(async () => ({
      sessionId: "s-actspace-1",
      workspaceRoot: "/Users/me/projects/actspace-agent",
      model: "deepseek-v4-pro",
    }));
    renderChromeBar({
      currentSession: SESSIONS[1],
      getSessionPreview,
    });

    fireEvent.focus(screen.getByRole("button", { name: "查看会话详情： New chat" }));

    await waitFor(() => expect(getSessionPreview).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("/Users/me/projects/actspace-agent");
  });

  it("refreshes context when the chrome preview is reopened", async () => {
    const user = userEvent.setup();
    const getSessionPreview = vi.fn(async () => ({
      sessionId: "s-actspace-1", contextSnapshot: { ...HOVER_CONTEXT, cumulativeTokens: 40000 },
    }));
    renderChromeBar({ currentSession: SESSIONS[1], getSessionPreview });
    const trigger = screen.getByRole("button", { name: "查看会话详情： New chat" });
    fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("累计 Token：40K");
    fireEvent.blur(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    getSessionPreview.mockResolvedValue({ sessionId: "s-actspace-1", contextSnapshot: { ...HOVER_CONTEXT, cumulativeTokens: 60000 } });
    fireEvent.focus(trigger);
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("累计 Token：60K"));
    expect(getSessionPreview).toHaveBeenCalledTimes(2);
  });

  it("declares the chrome strip as a fixed overlay with pointer-events: none on the wrapper", () => {
    const { container } = renderChromeBar();
    const bar = container.querySelector(".window-chrome-bar") as HTMLElement | null;
    expect(bar).not.toBeNull();
    // 不直接读 computed style（jsdom 不解析 CSS），只断言三段子结构存在，
    // 真正的 fixed + pointer-events 由 styles/electron.css 提供，CDP / 真机走另一道验收。
    expect(bar?.querySelector(".chrome-left")).not.toBeNull();
    expect(bar?.querySelector(".chrome-center")).not.toBeNull();
    expect(bar?.querySelector(".chrome-right")).not.toBeNull();
  });
});
