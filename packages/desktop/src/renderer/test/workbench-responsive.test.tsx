import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkbenchLayout } from "../components/WorkbenchLayout";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";

const originalInnerWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

type WorkbenchProps = Parameters<typeof WorkbenchLayout>[0];

const responsiveSessions: WorkbenchProps["sessions"] = [
  {
    id: "session-responsive",
    title: "Responsive layout",
    updatedAt: new Date().toISOString(),
    agentRunCount: 0,
    workspaceRoot: "/tmp/workspace",
  },
];

function WorkbenchFixture(overrides: Partial<WorkbenchProps> = {}) {
  return (
    <StrictMode>
      <RightPanelProvider>
        <WorkbenchLayout
          sessions={responsiveSessions}
          activeSessionId="session-responsive"
          title="Responsive layout"
          messages={[]}
          contextSnapshot={null}
          selectedWorkspaceRoot="/tmp/workspace"
          {...overrides}
        />
      </RightPanelProvider>
    </StrictMode>
  );
}

function renderWorkbench(overrides: Partial<WorkbenchProps> = {}) {
  return render(<WorkbenchFixture {...overrides} />);
}

describe("WorkbenchLayout narrow window behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(480);
  });

  afterEach(() => {
    window.localStorage.clear();
    setViewportWidth(originalInnerWidth);
    delete (window as { actspace?: typeof window.actspace }).actspace;
  });

  it("keeps the main conversation full-width and opens the session sidebar as an overlay", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.queryByTestId("compact-sidebar-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand session sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose workspace app" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show workspace environment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message composer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand session sidebar" }));

    const overlay = screen.getByTestId("compact-sidebar-overlay");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse session sidebar" })).toBeInTheDocument();
    expect(within(overlay).getByText("Responsive layout")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close session sidebar overlay" }));
    expect(screen.queryByTestId("compact-sidebar-overlay")).not.toBeInTheDocument();
  });

  it("lets approval content shrink with the 480px conversation column", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkbench({
      messages: [
        {
          kind: "user",
          id: "user-responsive-approval",
          content: "Check a command that has a long approval explanation at the narrow window width.",
          createdAt: "2026-08-05T10:00:00.000Z",
        },
        {
          kind: "bash",
          id: "bash-responsive-approval",
          status: "pending",
          title: "Run Bash command: wc",
          command: 'wc -l "Demos/finding-your-unknowns-box.html"',
          reason: "Bash always-ask mode is enabled (ACTSPACE_BASH_ALWAYS_ASK=1)",
          policyLabel: "Allowlist",
          approvalRequestId: "approval-responsive",
          createdAt: "2026-08-05T10:00:01.000Z",
        },
      ],
    });

    expect(container.querySelector(".conversation-shell")).toHaveClass(
      "min-w-0",
      "grid-cols-[minmax(0,1fr)]",
    );
    expect(container.querySelector(".conversation-message-viewport")).toHaveClass("min-w-0");
    expect(container.querySelector(".message-stack")).toHaveClass("min-w-0");
    expect(container.querySelector(".message-turn")).toHaveClass("min-w-0");
    expect(container.querySelector(".turn-body")).toHaveClass("min-w-0");
    expect(container.querySelector(".composer-zone")).toHaveClass("min-w-0");

    await user.click(screen.getByRole("button", { name: "Worked" }));
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  });

  it("opens the right panel as an overlay and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Open panel" }));

    expect(screen.getByTestId("compact-right-panel-overlay")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message composer")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("compact-right-panel-overlay")).not.toBeInTheDocument();
  });

  it("keeps the regular SplitView panes at desktop widths", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    const { container } = renderWorkbench();

    expect(screen.getByRole("button", { name: "Collapse session sidebar" })).toBeInTheDocument();
    expect(container.querySelector("aside.sidebar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open panel" }));

    expect(screen.queryByTestId("compact-right-panel-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize preview panel" })).toBeInTheDocument();
  });

  it("restores an unsent draft after visiting Settings", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    renderWorkbench();

    await user.type(screen.getByLabelText("Message composer"), "keep this draft");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "返回应用" }));

    expect(screen.getByLabelText("Message composer")).toHaveValue("keep this draft");
  });

  it("keeps separate unsent drafts for different sessions", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    const sessions: WorkbenchProps["sessions"] = [
      {
        id: "session-a",
        title: "Session A",
        updatedAt: "2026-08-05T10:00:00.000Z",
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
      {
        id: "session-b",
        title: "Session B",
        updatedAt: "2026-08-05T09:00:00.000Z",
        agentRunCount: 0,
        workspaceRoot: "/tmp/workspace",
      },
    ];
    const { rerender } = renderWorkbench({ sessions, activeSessionId: "session-a", title: "Session A" });

    await user.type(screen.getByLabelText("Message composer"), "draft for A");
    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-b" title="Session B" />);
    await waitFor(() => expect(screen.getByLabelText("Message composer")).toHaveValue(""));

    await user.type(screen.getByLabelText("Message composer"), "draft for B");
    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-a" title="Session A" />);
    await waitFor(() => expect(screen.getByLabelText("Message composer")).toHaveValue("draft for A"));

    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-b" title="Session B" />);
    await waitFor(() => expect(screen.getByLabelText("Message composer")).toHaveValue("draft for B"));
  });

  it("recalls persisted user messages through the Workbench composer", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    renderWorkbench({
      messages: [
        {
          kind: "user",
          id: "user-history-1",
          content: "previous session prompt",
          createdAt: "2026-08-05T10:00:00.000Z",
        },
        {
          kind: "assistant",
          id: "assistant-history-1",
          content: "Previous reply",
          createdAt: "2026-08-05T10:00:01.000Z",
        },
      ],
    });

    const input = screen.getByLabelText("Message composer");
    await user.click(input);
    await user.keyboard("{ArrowUp}");

    expect(input).toHaveValue("previous session prompt");
  });

  it("lets the right panel use the wide-screen space left after protecting the conversation", async () => {
    const user = userEvent.setup();
    setViewportWidth(2048);
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Open panel" }));

    expect(screen.getByRole("separator", { name: "Resize preview panel" })).toHaveAttribute("aria-valuemax", "1228");

    await user.click(screen.getByRole("button", { name: "Collapse session sidebar" }));
    expect(screen.getByRole("separator", { name: "Resize preview panel" })).toHaveAttribute("aria-valuemax", "1488");
  });

  it("keeps the session index in Settings and opens only a selected session as a standalone workspace", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    window.actspace = {
      getAgentAnalysisSessionIndex: async () => ({
        totals: {
          sessionCount: 1,
          agentRunCount: 0,
          turnCount: 0,
          llmCallCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          durationMs: 0,
        },
        modelNames: ["deepseek-v4-flash"],
        sessions: [{
          sessionId: "session-empty",
          title: "No analysis yet",
          updatedAt: "2026-07-29T09:05:00.000Z",
          status: "empty",
          agentRunCount: 0,
          turnCount: 0,
          llmCallCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          durationMs: 0,
          modelNames: ["deepseek-v4-flash"],
        }],
      }),
      getAgentAnalysisIndex: async ({ sessionId }) => ({
        sessionId,
        title: "No analysis yet",
        totals: {
          agentRunCount: 0,
          turnCount: 0,
          llmCallCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          durationMs: 0,
        },
        toolNames: [],
        runs: [],
      }),
    } as NonNullable<typeof window.actspace>;
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "返回应用" })).toBeInTheDocument();
    expect(screen.getByText("设置仅在桌面端可用。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "分析观测" }));
    expect(await screen.findByRole("heading", { name: "分析观测", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "设置导航" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分析观测" })).toHaveAttribute("aria-current", "page");

    await user.selectOptions(screen.getByRole("combobox", { name: "状态筛选" }), "empty");
    await user.click(screen.getByRole("button", { name: "打开分析会话：No analysis yet" }));
    expect(await screen.findByText("该会话暂无分析记录")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "设置导航" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "返回分析观测" })[0]);
    expect(await screen.findByRole("heading", { name: "分析观测", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "状态筛选" })).toHaveValue("empty");
    await user.click(screen.getByRole("button", { name: "返回应用" }));
    expect(screen.getByLabelText("Message composer")).toBeInTheDocument();
  });
});
