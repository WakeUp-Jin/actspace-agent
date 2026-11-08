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

function renderPanel(options: { navigation?: boolean; contextState?: ContextState } = {}) {
  const onShowTrajectory = vi.fn();
  const panel = <ContextPanel sessionId={SESSION} contextRevision={1} contextState={options.contextState} />;
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
  it("renders all blocks from the full mock view", async () => {
    setupBridge();
    renderPanel();

    for (const name of ["当前上下文", "会话统计", "上下文明细", "上下文趋势", "上下文事件", "Bash 命令"]) {
      expect(await screen.findByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Claude Opus 5.5")).toBeInTheDocument();
    expect(screen.getByText(/自动压缩 ≈160K/)).toBeInTheDocument();
    expect(screen.getByText("$0.42")).toBeInTheDocument();
    expect(screen.getByText(/最近请求实际/)).toBeInTheDocument();
    expect(screen.queryByText(/趋势、事件、路径和 Bash 命令需要后端数据/)).not.toBeInTheDocument();
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
    setupBridge({ "sessions.describeContextPanel": async () => null });
    renderPanel({ navigation: true, contextState });

    expect(await screen.findByText("趋势、事件、路径和 Bash 命令需要后端数据，暂未提供")).toBeInTheDocument();
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

  it("draws blocks without card borders, separated by one top line", async () => {
    setupBridge();
    renderPanel();
    const stats = await screen.findByRole("region", { name: "会话统计" });
    const overview = screen.getByRole("region", { name: "当前上下文" });
    for (const block of [overview, stats, screen.getByRole("region", { name: "上下文事件" })]) {
      expect(block.className).not.toMatch(/(^|\s)border(\s|$)/);
      expect(block.className).not.toMatch(/rounded-act-group/);
      expect(block).toHaveClass("border-t");
    }
    expect(stats.className).not.toMatch(/gap-px|bg-line/);
  });

  it("lists events with a kind tag, title, detail, delta and position", async () => {
    setupBridge();
    renderPanel();
    const events = await screen.findByRole("region", { name: "上下文事件" });
    const rows = Array.from(events.querySelectorAll<HTMLElement>("[data-context-event]"));
    expect(rows.map(row => row.dataset.contextEvent)).toEqual(["files", "runtime", "files", "subagents", "background", "tools-changed", "compact", "model-switch", "inject"]);
    expect(rows[0]).toHaveTextContent("文件活跃文件清单更新新增 context-history-projection.ts 等 2 个，共 14 个+410第 9 轮 · 步 3");
    // 合并行：标题带 ×N，位置只写轮。
    expect(rows[2]).toHaveTextContent("活跃文件清单更新 ×6");
    expect(rows[2]).toHaveTextContent(/第 8 轮$/);
    // 0 写「±0」用弱色；未知留空；推导的只在悬停说明里写。
    expect(within(rows[1]!).getByText("±0")).toHaveClass("text-text-faint");
    expect(rows[7]).toHaveTextContent("模型切换Sonnet 5.5 → Opus 5.5第 3 轮 · 步 1");
    expect(rows[7]).not.toHaveTextContent("推导");
    expect(rows[7]!.title).toContain("根据请求推导");
  });

  it("has no separate load-more button; 再显示 fetches the next page when the local rows run out", async () => {
    const view = mockContextPanelView(SESSION);
    const conversation = view.current.entries.filter(entry => entry.bucket === "conversation");
    const older = Array.from({ length: 30 }, (_, i) => ({ key: `older-${i}`, bucket: "conversation" as const, kind: "tool-call" as const, title: `更早 ${i}`, estimatedTokens: 1 }));
    const counts = { ...Object.fromEntries(Object.entries(Object.groupBy(view.current.entries, entry => entry.bucket)).map(([key, list]) => [key, list!.length])), conversation: conversation.length + older.length };
    const listContextEntries = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { revision: "rev", total: view.current.entries.length + older.length, bucketCounts: counts, entries: older, previous: [] };
    });
    setupBridge({
      "sessions.describeContextPanel": async () => ({ ...view, previous: null, entriesPage: { revision: "rev", total: view.current.entries.length + older.length, truncated: true, nextCursor: "c1", bucketCounts: counts } }),
      "sessions.listContextEntries": listContextEntries,
    });
    renderPanel();
    const browser = await screen.findByRole("region", { name: "上下文明细" });
    expect(screen.queryByRole("button", { name: /加载更多明细/ })).not.toBeInTheDocument();
    const section = browser.querySelector<HTMLElement>('[data-category="conversation"]')!;
    expect(section.querySelector("button")).toHaveTextContent(`${conversation.length + older.length} 项`);
    const more = () => within(section).getByRole("button", { name: /再显示|正在读取/ });
    while (more().textContent?.startsWith("再显示") && listContextEntries.mock.calls.length === 0) await userEvent.click(more());
    expect(listContextEntries).toHaveBeenCalledWith(expect.objectContaining({ revision: "rev", cursor: "c1" }));
    expect(await within(section).findByText("更早 29")).toBeInTheDocument();
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
