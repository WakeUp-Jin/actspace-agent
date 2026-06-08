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

  it("keeps the DeepSeek balance card visible when usage statistics are empty", () => {
    renderUsageStatisticsPage({
      snapshot: null,
      deepSeekBalance: {
        provider: "deepseek",
        isConfigured: true,
        isAvailable: true,
        generatedAt: "2026-05-29T03:00:00.000Z",
        displayBalance: { amount: "19.65", currency: "CNY" },
      },
    });

    expect(screen.getByText("DeepSeek 余额")).toBeInTheDocument();
    expect(screen.getByText("暂无 Usage 数据")).toBeInTheDocument();
  });

  it("renders the DeepSeek balance card with a compact amount and currency", () => {
    renderUsageStatisticsPage({
      snapshot: mockUsageStatistics,
      deepSeekBalance: {
        provider: "deepseek",
        isConfigured: true,
        isAvailable: true,
        generatedAt: "2026-05-29T03:00:00.000Z",
        displayBalance: { amount: "19.65", currency: "CNY" },
      },
    });

    const card = screen.getByRole("article", { name: "deepseek balance" });
    expect(within(card).getByText("DeepSeek 余额")).toBeInTheDocument();
    expect(within(card).getByText("¥19.65")).toBeInTheDocument();
    expect(within(card).getByText("CNY")).toBeInTheDocument();
  });

  it("renders a separate Kimi balance card alongside DeepSeek", () => {
    renderUsageStatisticsPage({
      snapshot: mockUsageStatistics,
      deepSeekBalance: {
        provider: "deepseek",
        isConfigured: true,
        isAvailable: true,
        generatedAt: "2026-05-29T03:00:00.000Z",
        displayBalance: { amount: "19.65", currency: "CNY" },
      },
      kimiBalance: {
        provider: "kimi",
        isConfigured: true,
        isAvailable: true,
        generatedAt: "2026-05-29T03:00:00.000Z",
        displayBalance: { amount: "8.20", currency: "CNY" },
      },
    });

    const kimiCard = screen.getByRole("article", { name: "kimi balance" });
    expect(within(kimiCard).getByText("Kimi 余额")).toBeInTheDocument();
    expect(within(kimiCard).getByText("¥8.20")).toBeInTheDocument();
  });

  it("calls the DeepSeek balance refresh handler from the balance card", async () => {
    const user = userEvent.setup();
    const onRefreshDeepSeekBalance = vi.fn();
    renderUsageStatisticsPage({
      snapshot: mockUsageStatistics,
      onRefreshDeepSeekBalance,
    });

    await user.click(screen.getByRole("button", { name: "Refresh deepseek balance" }));
    expect(onRefreshDeepSeekBalance).toHaveBeenCalledTimes(1);
  });

  it("calls the Kimi balance refresh handler from the balance card", async () => {
    const user = userEvent.setup();
    const onRefreshKimiBalance = vi.fn();
    renderUsageStatisticsPage({
      snapshot: mockUsageStatistics,
      onRefreshKimiBalance,
    });

    await user.click(screen.getByRole("button", { name: "Refresh kimi balance" }));
    expect(onRefreshKimiBalance).toHaveBeenCalledTimes(1);
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
        turnId: `turn-page-${index + 1}`,
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
