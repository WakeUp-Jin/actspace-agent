import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionListItem } from "@actspace/shared";
import { Sidebar } from "../components/Sidebar";

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
  const onToggleMode = vi.fn();
  const onNewSession = vi.fn();
  const onSelectSession = vi.fn();
  const onTogglePin = vi.fn();
  const onSelectView = vi.fn();

  render(
    <Sidebar
      sessions={SESSIONS}
      activeSessionId={null}
      mode="expanded"
      view="chat"
      onToggleMode={onToggleMode}
      onNewSession={onNewSession}
      onSelectSession={onSelectSession}
      onTogglePin={onTogglePin}
      onSelectView={onSelectView}
      {...overrides}
    />,
  );

  return { onToggleMode, onNewSession, onSelectSession, onTogglePin, onSelectView };
}

describe("Sidebar (cursor-aligned layout)", () => {
  it("renders the top primary actions (New Agent / Lab / Usage)", () => {
    renderSidebar();

    expect(screen.getByText("New Agent")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("⌘N")).toBeInTheDocument();
  });

  it("groups sessions by workspace and shows a Pinned section when any session is pinned", () => {
    renderSidebar();

    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("actspace-agent")).toBeInTheDocument();
    expect(screen.getByText("agent-harness-dev")).toBeInTheDocument();

    expect(screen.getByText("Bash 工具开发与权限调度")).toBeInTheDocument();
    expect(screen.getByText("README file improvement")).toBeInTheDocument();
  });

  it("invokes onTogglePin with the next pinned value when clicking the pin icon", async () => {
    const { onTogglePin } = renderSidebar();

    const pinButtons = screen.getAllByRole("button", { name: "Pin session" });
    expect(pinButtons.length).toBeGreaterThan(0);
    await userEvent.click(pinButtons[0]);

    expect(onTogglePin).toHaveBeenCalledWith("s-actspace-1", true);
  });

  it("calls onSelectView('lab') and ('usage') when their entries are clicked", async () => {
    const { onSelectView } = renderSidebar();

    await userEvent.click(screen.getByRole("button", { name: "Lab" }));
    await userEvent.click(screen.getByRole("button", { name: "Usage" }));

    expect(onSelectView).toHaveBeenCalledWith("lab");
    expect(onSelectView).toHaveBeenCalledWith("usage");
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
        onToggleMode={() => {}}
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
});
