import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsageStatisticsPage } from "../components/UsageStatisticsPage";
import { mockUsageStatistics } from "./fixtures/usageStatisticsFixture";
import { TooltipProvider } from "../components/ui/Tooltip";

/**
 * UsageStatisticsPage UI 测试覆盖：
 * 1. 默认渲染时不存在已废弃的"使用趋势"卡（防止后续重新引入造成视觉冗余）；
 * 2. 热力图格子 hover 时弹出 tooltip 并显示日期 / 总 tokens / 当日模型分布；
 * 3. 没数据的格子 hover 不应弹任何 tooltip（避免 empty popover）。
 */
describe("UsageStatisticsPage heatmap tooltip", () => {
  function renderUsageStatisticsPage(props: Parameters<typeof UsageStatisticsPage>[0]) {
    return render(
      <TooltipProvider delayDuration={0}>
        <UsageStatisticsPage {...props} />
      </TooltipProvider>,
    );
  }

  it("renders a full-width empty state without provider balance cards", () => {
    renderUsageStatisticsPage({ snapshot: null });

    expect(screen.getByText("暂无 Usage 数据")).toBeInTheDocument();
    expect(screen.queryByText(/DeepSeek 余额|Kimi 余额/)).toBeNull();
  });

  it("does not render the deprecated 使用趋势 panel", () => {
    renderUsageStatisticsPage({ snapshot: mockUsageStatistics });
    expect(screen.queryByText("使用趋势")).toBeNull();
  });

  it("renders request rows newest first with workspace labels and model call counts", () => {
    renderUsageStatisticsPage({
      snapshot: mockUsageStatistics,
      workspaces: [
        {
          id: "ws_actspace_agent",
          kind: "folder",
          label: "Actspace Agent",
          path: "/Users/me/projects/actspace-agent",
          order: 0,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    expect(screen.getByText("会话明细")).toBeInTheDocument();
    expect(screen.getByText("Actspace Agent")).toBeInTheDocument();
    expect(screen.getByText("agent-harness-dev")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek V4 Pro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1,629,467 tokens, show token breakdown" })).toBeInTheDocument();
    const latestRow = screen.getByText("session-us...00001").closest("tr");
    expect(latestRow).not.toBeNull();
    expect(within(latestRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(latestRow as HTMLElement).getByText("$0.84")).toBeInTheDocument();
  });

  it("shows USD cost in daily rows without rounding tiny usage down to zero", () => {
    const snapshot = {
      ...mockUsageStatistics,
      dailyRows: [
        {
          ...mockUsageStatistics.dailyRows[0],
          costUsd: 0.000123,
        },
      ],
    };
    renderUsageStatisticsPage({ snapshot });

    const dailyRow = screen.getByText("2026-05-26").closest("tr");
    expect(dailyRow).not.toBeNull();
    expect(within(dailyRow as HTMLElement).getByText("$0.000123")).toBeInTheDocument();
    expect(screen.getAllByText("费用 (USD)")).toHaveLength(2);
  });

  it("shows five daily rows per page and resets daily pagination when the range changes", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const dailyRows = Array.from({ length: 12 }, (_, index) => ({
      ...mockUsageStatistics.dailyRows[0],
      date: `2026-05-${String(26 - index).padStart(2, "0")}`,
      totalTokens: 12_000 - index,
    }));

    renderUsageStatisticsPage({
      snapshot: { ...mockUsageStatistics, dailyRows },
      onRefresh,
    });

    expect(screen.getByText("1-5 / 12 天")).toBeInTheDocument();
    expect(screen.getByText("2026-05-26")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-21")).toBeNull();
    expect(screen.getByRole("button", { name: "上一页每日明细" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页每日明细" }));

    expect(screen.getByText("6-10 / 12 天")).toBeInTheDocument();
    expect(screen.getByText("2026-05-21")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-26")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "周" }));

    expect(screen.getByText("1-5 / 12 天")).toBeInTheDocument();
    expect(screen.getByText("2026-05-26")).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledWith("week", 1);
  });

  it("requests the next request-row page from the pager", async () => {
    const user = userEvent.setup();
    const onRequestPageChange = vi.fn();
    const pagedSnapshot = {
      ...mockUsageStatistics,
      requestRows: Array.from({ length: 10 }, (_, index) => ({
        ...mockUsageStatistics.requestRows[0],
        timestamp: `2026-05-26T${String(9 - index).padStart(2, "0")}:07:00.000Z`,
        sessionId: `session-page-${index + 1}`,
        agentRunId: `turn-page-${index + 1}`,
        totalTokens: 1_000 + index,
      })),
      requestRowsPage: {
        page: 1,
        pageSize: 10,
        totalRows: 12,
        totalPages: 2,
      },
    };

    renderUsageStatisticsPage({
      snapshot: pagedSnapshot,
      onRequestPageChange,
    });

    expect(screen.getByText("1-10 / 12 rows")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页会话明细" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页会话明细" }));

    expect(onRequestPageChange).toHaveBeenCalledWith(2, "month");
  });

  it("shows token details on request token hover without Cache Write", async () => {
    const user = userEvent.setup();
    renderUsageStatisticsPage({ snapshot: mockUsageStatistics });

    await user.hover(screen.getByRole("button", { name: "1,629,467 tokens, show token breakdown" }));

    const tooltip = await screen.findByTestId("request-token-tooltip");
    expect(tooltip).toHaveTextContent("Cache Read");
    expect(tooltip).toHaveTextContent("1,464,212");
    expect(tooltip).toHaveTextContent("Input");
    expect(tooltip).toHaveTextContent("20");
    expect(tooltip).toHaveTextContent("Output");
    expect(tooltip).toHaveTextContent("10,642");
    expect(tooltip).toHaveTextContent("Total");
    expect(tooltip).toHaveTextContent("1,629,467");
    expect(tooltip).not.toHaveTextContent("Cache Write");
  });

  it("shows a readable tooltip for the tool detail close button", async () => {
    const user = userEvent.setup();
    renderUsageStatisticsPage({ snapshot: mockUsageStatistics });

    await user.click(screen.getByRole("button", { name: "查看详情" }));
    const closeButton = await screen.findByRole("button", { name: "Close detail" });
    await user.hover(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("关闭详情");
  });

  it("shows a tooltip with date + tokens + model breakdown when hovering a populated cell", async () => {
    const user = userEvent.setup();
    renderUsageStatisticsPage({ snapshot: mockUsageStatistics });

    // 拿 fixture 里实际存在的一个有数据的格子（2026-05-25 一定在热力图 16 周窗内）。
    const targetCell = screen.getByRole("button", {
      name: /2026-05-25：141,692,119 tokens/,
    });
    await user.hover(targetCell);

    const tooltip = await screen.findByTestId("heatmap-tooltip");
    expect(tooltip).toHaveTextContent("2026-05-25");
    expect(tooltip).toHaveTextContent("141,692,119");
    // "MODEL BREAKDOWN" 在 UI 上是 CSS `uppercase`，DOM 真实文本仍是小写。
    expect(tooltip).toHaveTextContent(/model breakdown/i);
    // 该日 modelBreakdown 头条是 gpt-5.5，占比 61%。
    expect(tooltip).toHaveTextContent("gpt-5.5");
    expect(tooltip).toHaveTextContent("61%");
  });

  it("does not render a tooltip when hovering an empty cell", async () => {
    const user = userEvent.setup();
    renderUsageStatisticsPage({ snapshot: mockUsageStatistics });

    // 取所有"无数据"格子里的第一个；它们都是空的，hover 任意一个都不应弹 tooltip。
    const emptyCells = screen.getAllByRole("button", { name: /：无数据$/ });
    expect(emptyCells.length).toBeGreaterThan(0);
    await user.hover(emptyCells[0]);

    expect(screen.queryByTestId("heatmap-tooltip")).toBeNull();
  });
});
