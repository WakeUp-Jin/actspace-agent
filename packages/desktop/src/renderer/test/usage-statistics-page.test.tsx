import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UsageStatisticsPage } from "../components/UsageStatisticsPage";
import { mockUsageStatistics } from "../fixtures/usageStatisticsFixture";

/**
 * UsageStatisticsPage UI 测试覆盖：
 * 1. 默认渲染时不存在已废弃的"使用趋势"卡（防止后续重新引入造成视觉冗余）；
 * 2. 热力图格子 hover 时弹出 tooltip 并显示日期 / 总 tokens / 当日模型分布；
 * 3. 没数据的格子 hover 不应弹任何 tooltip（避免 empty popover）。
 */
describe("UsageStatisticsPage heatmap tooltip", () => {
  it("does not render the deprecated 使用趋势 panel", () => {
    render(<UsageStatisticsPage snapshot={mockUsageStatistics} />);
    expect(screen.queryByText("使用趋势")).toBeNull();
  });

  it("shows a tooltip with date + tokens + model breakdown when hovering a populated cell", async () => {
    const user = userEvent.setup();
    render(<UsageStatisticsPage snapshot={mockUsageStatistics} />);

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
    render(<UsageStatisticsPage snapshot={mockUsageStatistics} />);

    // 取所有"无数据"格子里的第一个；它们都是空的，hover 任意一个都不应弹 tooltip。
    const emptyCells = screen.getAllByRole("button", { name: /：无数据$/ });
    expect(emptyCells.length).toBeGreaterThan(0);
    await user.hover(emptyCells[0]);

    expect(screen.queryByTestId("heatmap-tooltip")).toBeNull();
  });
});
