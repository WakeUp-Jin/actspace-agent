import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContextUsageSnapshot, SessionListItem } from "@actspace/shared";
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

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onNewSession = vi.fn();
  const onSelectSession = vi.fn();
  const onTogglePin = vi.fn();
  const onSelectView = vi.fn();
  const onRename = vi.fn();
  const onArchive = vi.fn();

  const result = render(
    <TooltipProvider delayDuration={0}>
      <Sidebar
        sessions={SESSIONS}
        activeSessionId={null}
        mode="expanded"
        view="chat"
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
        onTogglePin={onTogglePin}
        onSelectView={onSelectView}
        onRename={onRename}
        onArchive={onArchive}
        {...overrides}
      />
    </TooltipProvider>,
  );

  return { onNewSession, onSelectSession, onTogglePin, onSelectView, onRename, onArchive, ...result };
}

describe("Sidebar (cursor-aligned layout)", () => {
  it("renders the four top primary actions (New Agent / Lab / Usage / Kairos)", () => {
    renderSidebar();

    expect(screen.getByText("New Agent")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
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

  it("disables archive on the active session row", async () => {
    const { onArchive } = renderSidebar({ activeSessionId: "s-actspace-1" });

    const activeArchive = screen.getByRole("button", { name: "Current session cannot be archived" });
    expect(activeArchive).toBeDisabled();
    await userEvent.click(activeArchive);

    expect(onArchive).not.toHaveBeenCalled();
  });

  it("calls onSelectView for Lab / Usage / Kairos entries", async () => {
    const { onSelectView } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Lab" }));
    await userEvent.click(screen.getByRole("button", { name: "Usage" }));
    await userEvent.click(screen.getByRole("button", { name: "Kairos" }));

    expect(onSelectView).toHaveBeenCalledWith("lab");
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

  it("renders a muted status dot on every session row by default", () => {
    const { container } = renderSidebar();

    const sessionRows = container.querySelectorAll(".session-row:not(.is-muted)");
    expect(sessionRows.length).toBeGreaterThan(0);
    sessionRows.forEach((row) => {
      expect(row.querySelector(".session-status-dot")).not.toBeNull();
    });
  });

  it("does not show the session detail hover card from sidebar rows", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.hover(screen.getByText("工具定义格式和命名规范"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
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
