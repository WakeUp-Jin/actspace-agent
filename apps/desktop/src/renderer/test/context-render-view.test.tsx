import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContextState } from "@actspace/shared";
import { ContextRenderView } from "../components/right-panel/ContextRenderView";
import { mockContextState } from "./fixtures/workbenchFixture";
import { SessionProjectionProvider } from "../session";

describe("ContextRenderView", () => {
  afterEach(() => {
    delete (window as { actspace?: unknown }).actspace;
  });

  it("groups entries into ordered sections with the registry labels", () => {
    render(<ContextRenderView contextState={mockContextState} />);

    expect(screen.getByRole("button", { name: /系统提示词/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /工具/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /规则/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /会话内容/ })).toBeInTheDocument();
  });

  it("collapses Conversation by default and caps to 20 entries when expanded", async () => {
    const user = userEvent.setup();
    render(<ContextRenderView contextState={mockContextState} />);

    // 默认折叠：会话条目标题不可见。
    expect(screen.queryByText("User · 第 1 轮")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /会话内容/ }));

    // 展开后最多 20 条 + 余量提示（mock 有 28 条会话）。
    expect(screen.getByText("User · 第 1 轮")).toBeInTheDocument();
    expect(screen.getByText(/仅显示前 20 条/)).toBeInTheDocument();
    expect(screen.getByText(/其余 8 条/)).toBeInTheDocument();
  });

  it("offers markdown and json export buttons", () => {
    render(<ContextRenderView contextState={mockContextState} />);

    expect(screen.getByRole("button", { name: "导出 .md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 .json" })).toBeInTheDocument();
  });

  it("shows an empty state when there is no context state", () => {
    render(<ContextRenderView contextState={null} />);
    expect(screen.getByText(/没有可展示的上下文明细/)).toBeInTheDocument();
  });

  it("shows the Session projection metric while detailed context is rebuilding", () => {
    render(<ContextRenderView contextState={null} contextSnapshot={{
      totalTokens: 4_000,
      maxTokens: 200_000,
      percentUsed: 2,
      buckets: [],
    }} />);
    expect(screen.getByText(/上下文 · 2% 已用/)).toBeInTheDocument();
    expect(screen.getByText(/正在等待当前会话的上下文明细/)).toBeInTheDocument();
  });

  it("does not present cumulative provider usage as context when no request estimate exists", async () => {
    (window as { actspace?: unknown }).actspace = {
      getSessionProjectionSnapshot: async () => ({
        kind: "session-projection",
        schemaVersion: 1,
        sessionId: "session-1",
        throughJournalSeq: 3,
        snapshot: {
          kind: "session-snapshot",
          schemaVersion: 1,
          sessionId: "session-1",
          createdAt: "2026-08-31T00:00:00.000Z",
          updatedAt: "2026-08-31T00:00:03.000Z",
          workspaceRoot: null,
          throughJournalSeq: 3,
          accessState: "read-write",
          metadata: { title: null, pinned: false, archived: false },
          messages: [], tools: [], pendingInbox: [], todos: [], delegations: [],
          usage: { inputTokens: 1_200, outputTokens: 800, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2_000, costUsd: null },
          activity: { turnCount: 1, completedTurnCount: 1, stepCount: 1, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null },
          lineage: null,
        },
        values: {
          providerUsage: {
            kind: "provider-usage",
            schemaVersion: 1,
            sessionId: "session-1",
            throughJournalSeq: 3,
            estimator: { name: "durable-provider-usage", version: "1" },
            usage: { inputTokens: 1_200, outputTokens: 800, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2_000, costUsd: null },
          },
        },
      }),
      onSessionLiveEvent: () => () => undefined,
      describeContext: undefined,
    };

    render(
      <SessionProjectionProvider sessionId="session-1">
        <ContextRenderView />
      </SessionProjectionProvider>,
    );

    await waitFor(() => expect(screen.getByText(/当前没有可展示的上下文明细/)).toBeInTheDocument());
    expect(screen.queryByText(/2,000 \/ 0 Token/)).not.toBeInTheDocument();
  });

  it("fills missing previews with on-demand describeContext content when a sessionId is given", async () => {
    const base: ContextState = {
      sessionId: "s1",
      activeAgentRunId: "t1",
      updatedAt: new Date().toISOString(),
      estimator: { name: "test", version: "1" },
      totalEstimatedTokens: 1879,
      maxTokens: 200_000,
      percentUsed: 1,
      buckets: [],
      entries: [
        // 持久化快照里 Tools 有 token 但没有内容预览（老快照）。
        { id: "context_toolDefinitions", kind: "toolDefinitions", title: "Tools", estimatedTokens: 1879, included: true, removable: false },
      ],
    };
    const fresh: ContextState = {
      ...base,
      entries: [{ ...base.entries[0], preview: "• bash — 运行 shell 命令" }],
    };
    const describeContext = vi.fn(async () => fresh);
    (window as { actspace?: unknown }).actspace = { describeContext };

    render(<ContextRenderView contextState={base} sessionId="s1" />);

    expect(await screen.findByText(/运行 shell 命令/)).toBeInTheDocument();
    expect(describeContext).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("falls back to describeContext entirely when no persisted state exists", async () => {
    const fresh: ContextState = {
      sessionId: "s2",
      activeAgentRunId: "live",
      updatedAt: new Date().toISOString(),
      estimator: { name: "test", version: "1" },
      totalEstimatedTokens: 12,
      maxTokens: 200_000,
      percentUsed: 0,
      buckets: [],
      entries: [
        { id: "context_systemPrompt", kind: "systemPrompt", title: "System prompt", estimatedTokens: 12, included: true, removable: false, preview: "你是 actspace 智能体" },
      ],
    };
    (window as { actspace?: unknown }).actspace = { describeContext: async () => fresh };

    render(<ContextRenderView contextState={null} sessionId="s2" />);

    expect(await screen.findByText(/actspace 智能体/)).toBeInTheDocument();
  });
});
