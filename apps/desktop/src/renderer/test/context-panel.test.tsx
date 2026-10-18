import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContextState } from "@actspace/shared";
import { ContextPanel } from "../components/right-panel/context/ContextPanel";
import { TrajectoryNavigationProvider, useTrajectoryNavigation } from "../components/trajectory/TrajectoryNavigation";
import { TooltipProvider } from "../components/ui/Tooltip";
import { mockContextPanelView } from "../mock/context-panel-fixture";
import { setupBridge } from "./helpers/bridge";

const SESSION = "context-panel-session";

function PendingProbe() {
  const navigation = useTrajectoryNavigation();
  return <output data-testid="pending">{navigation?.pending ? JSON.stringify(navigation.pending.target) : ""}</output>;
}

function renderPanel(options: { navigation?: boolean } = {}) {
  const onShowTrajectory = vi.fn();
  const panel = <ContextPanel sessionId={SESSION} contextRevision={1} />;
  const wrap = (children: ReactNode) => options.navigation
    ? <TrajectoryNavigationProvider onShowTrajectory={onShowTrajectory}>{children}<PendingProbe /></TrajectoryNavigationProvider>
    : children;
  render(<TooltipProvider delayDuration={0}>{wrap(panel)}</TooltipProvider>);
  return { onShowTrajectory };
}

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("ContextPanel", () => {
  it("renders all five blocks from the full mock view", async () => {
    setupBridge();
    renderPanel();

    for (const name of ["当前上下文", "会话统计", "上下文明细", "上下文趋势", "上下文事件"]) {
      expect(await screen.findByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Claude Opus 5.5")).toBeInTheDocument();
    expect(screen.getByText(/自动压缩 ≈160K/)).toBeInTheDocument();
    expect(screen.getByText("$0.42")).toBeInTheDocument();
    expect(screen.getByText(/最近请求实际/)).toBeInTheDocument();
    expect(screen.queryByText(/趋势、事件和路径需要后端数据/)).not.toBeInTheDocument();
  });

  it("falls back to the interim view when describeContextPanel returns null", async () => {
    const contextState = {
      sessionId: SESSION,
      throughJournalSeq: 3,
      updatedAt: "2026-10-11T00:00:00.000Z",
      estimator: { name: "test", version: "1" },
      totalEstimatedTokens: 1_500,
      maxTokens: 200_000,
      percentUsed: 1,
      buckets: [{ key: "rules", tokens: 500 }, { key: "conversation", tokens: 1_000 }],
      entries: [
        { id: "rule-1", kind: "rules", title: "AGENTS.md", estimatedTokens: 500, included: true, preview: "# rules" },
        { id: "managed-3-message-0", kind: "conversation", title: "你好", estimatedTokens: 1_000, included: true },
      ],
    } as ContextState;
    setupBridge({
      "sessions.describeContextPanel": async () => null,
      "sessions.describeContext": async () => contextState,
    });
    renderPanel({ navigation: true });

    expect(await screen.findByText("趋势、事件和路径需要后端数据，暂未提供")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "上下文趋势" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "对比基准" })).toBeDisabled();
    // 过渡数据的会话条目没有类型和轨迹身份：没有类型 chip，行不可点，只留「在轨迹中打开」。
    expect(screen.getByText("你好").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /^用户/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在轨迹中打开" })).toBeInTheDocument();
  });

  it("focuses a category from the legend and dims the others", async () => {
    setupBridge();
    renderPanel();
    const overview = await screen.findByRole("region", { name: "当前上下文" });
    const tools = within(overview).getByRole("button", { name: /^工具/ });

    await userEvent.click(tools);
    expect(tools).toHaveAttribute("aria-pressed", "true");
    const browser = screen.getByRole("region", { name: "上下文明细" });
    expect(browser.querySelector('[data-category="rules"] > button')).toHaveClass("opacity-45");
    expect(browser.querySelector('[data-category="tools"] > button')).not.toHaveClass("opacity-45");

    await userEvent.click(tools);
    expect(tools).toHaveAttribute("aria-pressed", "false");
  });

  it("drops new / removed markers when comparison is turned off", async () => {
    setupBridge();
    renderPanel();
    const browser = await screen.findByRole("region", { name: "上下文明细" });
    expect(within(browser).getAllByText("新增").length).toBeGreaterThan(0);
    // 已移除的工具排在「工具」末尾，在首屏 12 项之后。
    const tools = browser.querySelector<HTMLElement>('[data-category="tools"]')!;
    await userEvent.click(within(tools).getByRole("button", { name: /再显示/ }));
    expect(within(browser).getByText("已移除")).toBeInTheDocument();

    await choose("对比基准", "不对比");
    expect(within(browser).queryByText("新增")).not.toBeInTheDocument();
    expect(within(browser).queryByText("已移除")).not.toBeInTheDocument();
  });

  it("filters conversation rows by kind and names the latest-of-kind trajectory link", async () => {
    setupBridge();
    const { onShowTrajectory } = renderPanel({ navigation: true });
    const browser = await screen.findByRole("region", { name: "上下文明细" });

    await userEvent.click(within(browser).getByRole("button", { name: /^工具调用 \d+$/ }));
    expect(within(browser).queryByText("帮我把设置页的模型列表重新设计一下")).not.toBeInTheDocument();
    const link = within(browser).getByRole("button", { name: "在轨迹中打开最新工具调用" });

    await userEvent.click(link);
    expect(onShowTrajectory).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pending")).toHaveTextContent(JSON.stringify({ latest: "tool-call" }));
  });

  it("reveals a conversation row in the trajectory with its call id", async () => {
    setupBridge();
    renderPanel({ navigation: true });
    const expected = mockContextPanelView(SESSION).current.entries.find((entry) => entry.title === "write_file · 已写入")!.trajectoryRef;

    await userEvent.click(await screen.findByTitle("在轨迹中查看：write_file · 已写入"));
    expect(screen.getByTestId("pending")).toHaveTextContent(JSON.stringify({ callId: expected!.callId }));
  });

  it("hides the cost cell when costUsd is null", async () => {
    const view = mockContextPanelView(SESSION);
    setupBridge({ "sessions.describeContextPanel": async () => ({ ...view, stats: { ...view.stats, costUsd: null } }) });
    renderPanel();

    const stats = await screen.findByRole("region", { name: "会话统计" });
    expect(within(stats).getByText("轮次")).toBeInTheDocument();
    expect(within(stats).queryByText("费用")).not.toBeInTheDocument();
  });

  it("shows an error with retry and recovers on the next read", async () => {
    let fail = true;
    setupBridge({
      "sessions.describeContextPanel": async ({ sessionId }) => {
        if (fail) throw new Error("读取失败");
        return mockContextPanelView(sessionId);
      },
    });
    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("读取失败");
    fail = false;
    await userEvent.click(within(alert).getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("region", { name: "上下文趋势" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
