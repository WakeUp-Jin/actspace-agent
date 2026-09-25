import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchLayout } from "../components/WorkbenchLayout";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";

import { SessionProjectionProvider } from "../session";
import { mockContextSnapshot } from "./fixtures/workbenchFixture";

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

function StatefulWorkbench({ sessions }: { sessions: WorkbenchProps["sessions"] }) {
  const [activeSessionId, setActiveSessionId] = useState(sessions[0]?.id ?? null);
  const activeTitle = sessions.find((session) => session.id === activeSessionId)?.title ?? "New chat";
  return (
    <WorkbenchFixture
      sessions={sessions}
      activeSessionId={activeSessionId}
      title={activeTitle}
      onSelectSession={setActiveSessionId}
    />
  );
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

  it("keeps chrome, footer and popup on the complete estimate instead of the generic projection", async () => {
    const contextSnapshot = { ...mockContextSnapshot, totalTokens: 49_000, maxTokens: 1_000_000, percentUsed: 4.9, cumulativeTokens: 549000 };
    const getSessionProjectionSnapshot = vi.fn(async () => ({
      kind: "session-projection", schemaVersion: 1, sessionId: "session-responsive", throughJournalSeq: 3,
      snapshot: {
        kind: "session-snapshot", schemaVersion: 1, sessionId: "session-responsive",
        createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:03Z",
        workspaceRoot: null, throughJournalSeq: 3, accessState: "read-write",
        metadata: { title: null, pinned: false, archived: false },
        messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], lineage: null,
        usage: { inputTokens: 549_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 549_000, costUsd: null },
        activity: { turnCount: 1, completedTurnCount: 1, stepCount: 1, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null },
      },
      values: {
        requestContextEstimate: {
          kind: "request-context-estimate", schemaVersion: 1, sessionId: "session-responsive", throughJournalSeq: 3,
          requestId: "request-1", estimator: { name: "runtime-v2-request-snapshot", version: "1" },
          totalEstimatedTokens: 60_000, maxTokens: 1_000_000, percentUsed: 6,
        },
      },
    }));
    (window as { actspace?: unknown }).actspace = { getSessionProjectionSnapshot, onSessionLiveEvent: () => () => undefined };
    const user = userEvent.setup();
    render(
      <SessionProjectionProvider sessionId="session-responsive">
        <WorkbenchFixture isSessionReady messages={[{ kind: "user", id: "user-1", content: "hello", createdAt: "2026-09-15T00:00:00Z" }]} contextSnapshot={contextSnapshot} getSessionPreview={() => ({ sessionId: "session-responsive", contextSnapshot })} />
      </SessionProjectionProvider>,
    );
    await waitFor(() => expect(getSessionProjectionSnapshot).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "上下文用量 4%" }));
    expect(screen.getByText("4% 已用")).toBeVisible();
    expect(screen.getByText("~49K / 1M Token")).toBeVisible();
    await user.hover(screen.getByRole("button", { name: "查看会话详情： Responsive layout" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("累计 Token：549K");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("上下文");
  });

  it("keeps the main conversation full-width and opens the session sidebar as an overlay", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.queryByTestId("compact-sidebar-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开会话侧栏" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose workspace app" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看工作区环境" })).toBeInTheDocument();
    expect(screen.getByLabelText("消息输入框")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开会话侧栏" }));

    const overlay = screen.getByTestId("compact-sidebar-overlay");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起会话侧栏" })).toBeInTheDocument();
    expect(within(overlay).getByText("Responsive layout")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭会话侧栏浮层" }));
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
    expect(screen.getByRole("button", { name: "运行" })).toBeInTheDocument();
  });

  it("opens the right panel as an overlay and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "打开面板" }));

    expect(screen.getByTestId("compact-right-panel-overlay")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByLabelText("消息输入框")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("compact-right-panel-overlay")).not.toBeInTheDocument();
  });

  it("keeps the regular SplitView panes at desktop widths", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    const { container } = renderWorkbench();

    expect(screen.getByRole("button", { name: "收起会话侧栏" })).toBeInTheDocument();
    expect(container.querySelector("aside.sidebar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开面板" }));

    expect(screen.queryByTestId("compact-right-panel-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整预览面板宽度" })).toBeInTheDocument();
  });

  it("restores an unsent draft after visiting Settings", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    renderWorkbench();

    await user.type(screen.getByLabelText("消息输入框"), "keep this draft");
    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(screen.getByRole("button", { name: "返回应用" }));

    expect(screen.getByLabelText("消息输入框")).toHaveValue("keep this draft");
  });

  it("opens extensions beside the sidebar and restores the chat draft", async () => {
    const user = userEvent.setup();
    setViewportWidth(1440);
    renderWorkbench();
    await user.type(screen.getByLabelText("消息输入框"), "extension draft");
    await user.click(screen.getByRole("button", { name: "打开面板" }));
    await user.click(screen.getByRole("button", { name: "扩展" }));
    expect(screen.getByRole("main", { name: "扩展内容" })).toBeVisible();
    expect(screen.getByRole("main", { name: "扩展内容" }).parentElement).toHaveClass("pt-[var(--window-chrome-strip-height)]");
    expect(screen.getByRole("navigation", { name: "会话" })).toBeVisible();
    expect(screen.queryByRole("separator", { name: "调整预览面板宽度" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开面板" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation", { name: "会话" })).getByText("Responsive layout"));
    expect(screen.getByLabelText("消息输入框")).toHaveValue("extension draft");
    expect(screen.getByRole("separator", { name: "调整预览面板宽度" })).toBeVisible();
  });

  it("closes the compact sidebar when selecting extensions", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.click(screen.getByRole("button", { name: "展开会话侧栏" }));
    await user.click(screen.getByRole("button", { name: "扩展" }));
    expect(screen.queryByTestId("compact-sidebar-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("main", { name: "扩展内容" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "展开会话侧栏" }));
    await user.click(screen.getByRole("button", { name: "新建会话" }));
    expect(screen.getByLabelText("消息输入框")).toBeVisible();
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

    await user.type(screen.getByLabelText("消息输入框"), "draft for A");
    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-b" title="Session B" />);
    await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue(""));

    await user.type(screen.getByLabelText("消息输入框"), "draft for B");
    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-a" title="Session A" />);
    await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("draft for A"));

    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-b" title="Session B" />);
    await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("draft for B"));
  });

  it("navigates the visited session history with the chrome back and forward buttons", async () => {
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
    render(<StatefulWorkbench sessions={sessions} />);

    await user.click(screen.getByRole("button", { name: "B" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Session B" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "后退" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "后退" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Session A" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "前进" })).not.toBeDisabled();
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

    const input = screen.getByLabelText("消息输入框");
    await user.click(input);
    await user.keyboard("{ArrowUp}");

    expect(input).toHaveValue("previous session prompt");
  });

  it("switches the stable session shell between Chat and Trajectory without losing the composer draft", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    renderWorkbench({
      messages: [
        {
          kind: "user",
          id: "user-trajectory-toggle",
          content: "show the trajectory",
          createdAt: "2026-08-05T10:00:00.000Z",
        },
        {
          kind: "assistant",
          id: "assistant-trajectory-toggle",
          content: "Here is the conversation.",
          createdAt: "2026-08-05T10:00:01.000Z",
        },
      ],
    });

    const input = screen.getByLabelText("消息输入框");
    await user.type(input, "keep this while inspecting the run");
    await user.click(screen.getByRole("button", { name: "查看执行轨迹" }));

    expect(screen.getByTestId("trajectory-view")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "会话消息" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("消息输入框")).toHaveValue("keep this while inspecting the run");

    await user.click(screen.getByRole("button", { name: "返回对话" }));
    expect(screen.getByRole("region", { name: "会话消息" })).toBeInTheDocument();
    expect(screen.getByLabelText("消息输入框")).toHaveValue("keep this while inspecting the run");
  });

  it("keeps the blank-session draft available in the bottom trajectory composer", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.type(screen.getByLabelText("消息输入框"), "draft before inspecting");
    await user.click(screen.getByRole("button", { name: "查看执行轨迹" }));
    expect(screen.getAllByLabelText("消息输入框")).toHaveLength(1);
    expect(screen.getByLabelText("消息输入框")).toHaveValue("draft before inspecting");
    await user.click(screen.getByRole("button", { name: "返回对话" }));
    expect(screen.getByLabelText("消息输入框")).toHaveValue("draft before inspecting");
  });

  it("remembers the selected main view per session", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    const sessions: WorkbenchProps["sessions"] = [
      { id: "session-view-a", title: "Session View A", updatedAt: "2026-08-05T10:00:00.000Z", agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
      { id: "session-view-b", title: "Session View B", updatedAt: "2026-08-05T09:00:00.000Z", agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
    ];
    const { rerender } = renderWorkbench({
      sessions,
      activeSessionId: "session-view-a",
      title: "Session View A",
      messages: [{ kind: "assistant", id: "assistant-view-a", content: "A", createdAt: "2026-08-05T10:00:01.000Z" }],
    });

    await user.click(screen.getByRole("button", { name: "查看执行轨迹" }));
    expect(screen.getByTestId("trajectory-view")).toBeInTheDocument();

    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-view-b" title="Session View B" messages={[{ kind: "assistant", id: "assistant-view-b", content: "B", createdAt: "2026-08-05T09:00:01.000Z" }]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "查看执行轨迹" })).toBeInTheDocument());

    rerender(<WorkbenchFixture sessions={sessions} activeSessionId="session-view-a" title="Session View A" messages={[{ kind: "assistant", id: "assistant-view-a", content: "A", createdAt: "2026-08-05T10:00:01.000Z" }]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "返回对话" })).toBeInTheDocument());
    expect(screen.getByTestId("trajectory-view")).toBeInTheDocument();
  });

  it("lets the right panel use the wide-screen space left after protecting the conversation", async () => {
    const user = userEvent.setup();
    setViewportWidth(2048);
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "打开面板" }));

    expect(screen.getByRole("separator", { name: "调整预览面板宽度" })).toHaveAttribute("aria-valuemax", "1228");

    await user.click(screen.getByRole("button", { name: "收起会话侧栏" }));
    expect(screen.getByRole("separator", { name: "调整预览面板宽度" })).toHaveAttribute("aria-valuemax", "1488");
  });

  it("returns from Settings to chat without an analysis entry", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("navigation", { name: "设置导航" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "分析观测" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用统计" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档会话" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回应用" }));
    expect(screen.getByLabelText("消息输入框")).toBeInTheDocument();
  });
});
