import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionListItem } from "@actspace/shared";
import { Sidebar, SidebarChromeRow } from "../components/Sidebar";

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

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onNewSession = vi.fn();
  const onSelectSession = vi.fn();
  const onTogglePin = vi.fn();
  const onSelectView = vi.fn();
  const onArchive = vi.fn();

  const result = render(
    <Sidebar
      sessions={SESSIONS}
      activeSessionId={null}
      mode="expanded"
      view="chat"
      onNewSession={onNewSession}
      onSelectSession={onSelectSession}
      onTogglePin={onTogglePin}
      onSelectView={onSelectView}
      onArchive={onArchive}
      {...overrides}
    />,
  );

  return { onNewSession, onSelectSession, onTogglePin, onSelectView, onArchive, ...result };
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
    const { container } = render(
      <Sidebar
        sessions={SESSIONS}
        activeSessionId="s-actspace-1"
        mode="expanded"
        view="chat"
        busySessionIds={new Set(["s-actspace-2"])}
      />,
    );

    const activeRow = container.querySelector('[data-group-key="actspace-agent"]') ?? container;
    expect(within(activeRow as HTMLElement).getByText("工具定义格式和命名规范").closest(".session-row")).toHaveClass(
      "is-active",
    );
    expect(within(activeRow as HTMLElement).getByText("Conversation context lookup").closest(".session-row")).toHaveClass(
      "is-busy",
    );
  });

  it("collapses Pinned section when its label is clicked", async () => {
    renderSidebar();

    expect(screen.getByText("Bash 工具开发与权限调度")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Pinned$/ }));
    expect(screen.queryByText("Bash 工具开发与权限调度")).not.toBeInTheDocument();
  });

  it("collapses Scheduled section when its label is clicked", async () => {
    renderSidebar();

    expect(screen.getByText("Weekly context audit")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Scheduled$/ }));
    expect(screen.queryByText("Weekly context audit")).not.toBeInTheDocument();
  });

  it("renders a muted status dot on every session row by default", () => {
    const { container } = renderSidebar();

    const sessionRows = container.querySelectorAll(".session-row");
    expect(sessionRows.length).toBeGreaterThan(0);
    sessionRows.forEach((row) => {
      expect(row.querySelector(".session-status-dot")).not.toBeNull();
    });
  });

  it("renders nothing when mode is hidden", () => {
    const { container } = render(
      <Sidebar
        sessions={SESSIONS}
        activeSessionId={null}
        mode="hidden"
        view="chat"
      />,
    );

    expect(container.querySelector(".sidebar")).toBeNull();
  });
});

describe("SidebarChromeRow", () => {
  it("renders collapse + search buttons and calls onToggleMode when clicking PanelLeft", async () => {
    const onToggleMode = vi.fn();
    const onOpenSearch = vi.fn();

    render(<SidebarChromeRow mode="expanded" onToggleMode={onToggleMode} onOpenSearch={onOpenSearch} />);

    const collapse = screen.getByRole("button", { name: "Collapse session sidebar" });
    const search = screen.getByRole("button", { name: "Search sessions" });
    expect(collapse).toBeInTheDocument();
    expect(search).toBeInTheDocument();

    await userEvent.click(collapse);
    await userEvent.click(search);

    expect(onToggleMode).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("toggles the PanelLeft label to Expand when sidebar is hidden", () => {
    render(<SidebarChromeRow mode="hidden" onToggleMode={() => {}} />);

    expect(screen.getByRole("button", { name: "Expand session sidebar" })).toBeInTheDocument();
  });
});
