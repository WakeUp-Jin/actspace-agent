import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContextUsageSnapshot, SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { Sidebar } from "../components/Sidebar";
import { WindowChromeBar } from "../components/WindowChromeBar";
import { TooltipProvider } from "../components/ui/Tooltip";

function makeSession(partial: Partial<SessionListItem> & Pick<SessionListItem, "id" | "title">): SessionListItem {
  return {
    updatedAt: new Date().toISOString(),
    turnCount: 1,
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

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
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
      <Sidebar
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
  it("renders the three top primary actions (New Agent / Usage / Kairos)", () => {
    renderSidebar();

    expect(screen.getByText("New Agent")).toBeInTheDocument();
    expect(screen.queryByText("Lab")).not.toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("Kairos")).toBeInTheDocument();
    expect(screen.getByText("⌘N")).toBeInTheDocument();
  });

  it("renders a Workspaces parent section above the workspace folders", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: /^Workspaces$/ })).toBeInTheDocument();
    // Workspace folders 在 Workspaces 父级下方仍可见
    expect(screen.getByText("actspace-agent")).toBeInTheDocument();
    expect(screen.getByText("agent-harness-dev")).toBeInTheDocument();
  });

  it("opens the workspace menu from the folder name and invokes its actions", async () => {
    const user = userEvent.setup();
    const { onOpenWorkspace, onArchiveWorkspace, onRemoveWorkspace } = renderSidebar();

    await user.click(screen.getByRole("button", { name: "actspace-agent" }));
    expect(screen.getByRole("menu", { name: "Workspace actions for actspace-agent" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Open in IDE" }));
    expect(onOpenWorkspace).toHaveBeenCalledWith("ws-actspace");

    await user.click(screen.getByRole("button", { name: "actspace-agent" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive All" }));
    expect(onArchiveWorkspace).toHaveBeenCalledWith("ws-actspace", "/Users/me/projects/actspace-agent");

    await user.click(screen.getByRole("button", { name: "actspace-agent" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from Sidebar" }));
    expect(onRemoveWorkspace).toHaveBeenCalledWith("ws-actspace", "/Users/me/projects/actspace-agent");
  });

  it("keeps the chevron dedicated to collapse and disables default workspace removal", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Collapse actspace-agent" }));
    expect(screen.queryByText("Conversation context lookup")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Workspace actions for actspace-agent" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Default workspace" }));
    expect(screen.getByRole("menuitem", { name: "Remove from Sidebar" })).toBeDisabled();
  });

  it("keeps the session list on vertical scrolling only", () => {
    const { container } = renderSidebar();

    expect(screen.getByRole("navigation", { name: "Sessions" })).toHaveClass(
      "sidebar-scrollbar",
      "overflow-x-hidden",
      "overflow-y-auto",
    );
    expect(container.querySelector("aside.sidebar")).not.toHaveClass("border-r");
  });

  it("collapses all workspace folders when the Workspaces parent is toggled", async () => {
    renderSidebar();

    expect(screen.getByText("actspace-agent")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Workspaces$/ }));
    expect(screen.queryByText("actspace-agent")).not.toBeInTheDocument();
    expect(screen.queryByText("agent-harness-dev")).not.toBeInTheDocument();
  });

  it("shows a Pinned section when any session is pinned", () => {
    renderSidebar();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Bash 工具开发与权限调度")).toBeInTheDocument();
  });

  it("invokes onTogglePin with the next pinned value when clicking the pin icon", async () => {
    const { onTogglePin } = renderSidebar();

    const pinButtons = screen.getAllByRole("button", { name: "Pin session" });
    expect(pinButtons.length).toBeGreaterThan(0);
    await userEvent.click(pinButtons[0]);

    expect(onTogglePin).toHaveBeenCalledWith("s-actspace-1", true);
  });

  it("invokes onArchive when clicking the archive button on a session row", async () => {
    const { onArchive } = renderSidebar();

    const archiveButtons = screen.getAllByRole("button", { name: "Archive session" });
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

    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Rename session 工具定义格式和命名规范" });
    await user.clear(input);
    await user.type(input, "重命名后的会话{Enter}");

    expect(onRename).toHaveBeenCalledWith("s-actspace-1", "重命名后的会话");
  });

  it("opens the Copy submenu and invokes Copy ID / Copy Transcript", async () => {
    const user = userEvent.setup();
    const { onCopySessionId, onCopyTranscript } = renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy ID" }));
    expect(onCopySessionId).toHaveBeenCalledWith("s-actspace-1");

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    await user.hover(screen.getByRole("menuitem", { name: "Copy" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy Transcript" }));
    expect(onCopyTranscript).toHaveBeenCalledWith("s-actspace-1");
  });

  it("invokes Fork and disables it while the session is busy", async () => {
    const user = userEvent.setup();
    const first = renderSidebar();
    const row = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "Fork" }));
    expect(first.onFork).toHaveBeenCalledWith("s-actspace-1");

    first.unmount();
    const busy = renderSidebar({ busySessionIds: new Set(["s-actspace-1"]) });
    const busyRow = screen.getByText("工具定义格式和命名规范").closest(".session-row");
    fireEvent.contextMenu(busyRow as HTMLElement, { clientX: 120, clientY: 80 });
    const fork = screen.getByRole("menuitem", { name: "Fork" });
    expect(fork).toBeDisabled();
    await user.click(fork);
    expect(busy.onFork).not.toHaveBeenCalled();
  });

  it("disables archive on the active session row", async () => {
    const { onArchive } = renderSidebar({ activeSessionId: "s-actspace-1" });

    const activeArchive = screen.getByRole("button", { name: "Current session cannot be archived" });
    expect(activeArchive).toBeDisabled();
    await userEvent.click(activeArchive);

    expect(onArchive).not.toHaveBeenCalled();
  });

  it("calls onSelectView for Usage / Kairos entries", async () => {
    const { onSelectView } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Usage" }));
    await userEvent.click(screen.getByRole("button", { name: "Kairos" }));

    expect(onSelectView).toHaveBeenCalledWith("usage");
    expect(onSelectView).toHaveBeenCalledWith("kairos");
  });

  it("invokes onNewSession when clicking the workspace folder + button", async () => {
    const { onNewSession } = renderSidebar();

    const addButtons = screen.getAllByRole("button", { name: "New chat in workspace" });
    expect(addButtons.length).toBeGreaterThanOrEqual(2); // actspace-agent + agent-harness-dev
    await userEvent.click(addButtons[0]);

    expect(onNewSession).toHaveBeenCalled();
  });

  it("shows See more when a workspace has more than 8 sessions and expands on click", async () => {
    const many: SessionListItem[] = Array.from({ length: 12 }, (_, idx) =>
      makeSession({
        id: `s-${idx}`,
        title: `Plan item ${idx}`,
        workspaceRoot: "/Users/me/projects/big-workspace",
      }),
    );

    renderSidebar({ sessions: many });

    expect(screen.queryByText("Plan item 0")).toBeInTheDocument();
    expect(screen.queryByText("Plan item 9")).not.toBeInTheDocument();

    const seeMore = screen.getByRole("button", { name: /^See more/ });
    await userEvent.click(seeMore);

    expect(screen.getByText("Plan item 9")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See less" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Session status: Idle" })).toBeInTheDocument();
  });

  it("collapses Pinned section when its label is clicked", async () => {
    renderSidebar();

    expect(screen.getByText("Bash 工具开发与权限调度")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Pinned$/ }));
    expect(screen.queryByText("Bash 工具开发与权限调度")).not.toBeInTheDocument();
  });

  it("collapses the empty Scheduled section when its label is clicked", async () => {
    renderSidebar();

    expect(screen.getByText("No scheduled tasks")).toBeInTheDocument();
    expect(screen.queryByText("Create one when automation is available")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Scheduled$/ }));
    expect(screen.queryByText("No scheduled tasks")).not.toBeInTheDocument();
  });

  it("shows a readable tooltip for Scheduled more actions", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.hover(screen.getByRole("button", { name: "More scheduled actions" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("更多定时任务操作");
  });

  it("shows a readable tooltip for new Scheduled task", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.hover(screen.getByRole("button", { name: "New scheduled task" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("新建定时任务");
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

    const pin = within(actions as HTMLElement).getByRole("button", { name: "Unpin session" });
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

    expect(screen.getByRole("menu", { name: "Session actions for 工具定义格式和命名规范" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Rename session 工具定义格式和命名规范" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
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
    const onOpenSearch = vi.fn();
    const result = render(
      <TooltipProvider delayDuration={0}>
        <WindowChromeBar
          leftMode="expanded"
          rightOpen={false}
          title="New chat"
          onToggleLeft={onToggleLeft}
          onToggleRight={onToggleRight}
          onOpenSearch={onOpenSearch}
          {...overrides}
        />
      </TooltipProvider>,
    );
    return { onToggleLeft, onToggleRight, onOpenSearch, ...result };
  }

  it("renders the left toggle, search, and right toggle buttons + the title", () => {
    renderChromeBar({ title: "Workspace > New chat" });

    expect(screen.getByRole("button", { name: "Collapse session sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search sessions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open panel" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workspace > New chat" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Select workspace for next message" })).not.toBeInTheDocument();
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

    const left = screen.getByRole("button", { name: "Expand session sidebar" });
    expect(left).toBeInTheDocument();
    expect(left.getAttribute("aria-pressed")).toBe("false");
  });

  it("flips the right toggle aria-label / aria-pressed when right panel is open", () => {
    renderChromeBar({ rightOpen: true });

    const right = screen.getByRole("button", { name: "Close panel" });
    expect(right).toBeInTheDocument();
    expect(right.getAttribute("aria-pressed")).toBe("true");
  });

  it("invokes the corresponding callbacks for left toggle, search, right toggle", async () => {
    const { onToggleLeft, onToggleRight, onOpenSearch } = renderChromeBar();

    await userEvent.click(screen.getByRole("button", { name: "Collapse session sidebar" }));
    await userEvent.click(screen.getByRole("button", { name: "Search sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Open panel" }));

    expect(onToggleLeft).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(onToggleRight).toHaveBeenCalledTimes(1);
  });

  it("can hide the right toggle button for full-page views like Kairos", () => {
    renderChromeBar({ showRightToggle: false });

    expect(screen.queryByRole("button", { name: "Open panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse session sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search sessions" })).toBeInTheDocument();
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

    await user.hover(screen.getByRole("button", { name: "Show session details for New chat" }));
    const tooltip = await screen.findByRole("tooltip");

    expect(getSessionPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "s-actspace-1" }));
    expect(tooltip).toHaveTextContent("New chat");
    expect(tooltip).toHaveTextContent("/Users/me/Desktop/code-project/side-project/actspace-agent");
    expect(tooltip).toHaveTextContent("DeepSeek V4 Pro");
    expect(tooltip).toHaveTextContent("Context 56%");
    expect(tooltip).toHaveTextContent("56,000 / 100,000");
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

    fireEvent.focus(screen.getByRole("button", { name: "Show session details for New chat" }));

    await waitFor(() => expect(getSessionPreview).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("/Users/me/projects/actspace-agent");
  });

  it("does not reload the same chrome title preview on repeated hovers", async () => {
    const user = userEvent.setup();
    const getSessionPreview = vi.fn(async () => ({
      sessionId: "s-actspace-1",
      workspaceRoot: "/Users/me/projects/actspace-agent",
    }));
    renderChromeBar({
      currentSession: SESSIONS[1],
      getSessionPreview,
    });

    const trigger = screen.getByRole("button", { name: "Show session details for New chat" });
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("/Users/me/projects/actspace-agent");
    await user.unhover(trigger);
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("/Users/me/projects/actspace-agent");

    expect(getSessionPreview).toHaveBeenCalledTimes(1);
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
