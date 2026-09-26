import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsageStatisticsPage } from "../components/UsageStatisticsPage";
import { mockUsageActivity } from "./fixtures/usageStatisticsFixture";
import type { SettingsV4Snapshot, UsageActivitySnapshot } from "@actspace/shared";

const data: UsageActivitySnapshot = { ...mockUsageActivity, costSummary: { costUsd: 0.12, knownCostRequestCount: 2, unknownCostRequestCount: 1, unverifiedHistoricalRequestCount: 0 }, rows: mockUsageActivity.rows.map((row) => row.costUsd === null ? row : { ...row, costAmount: row.costUsd, costCurrency: "USD", costBasis: "estimated" }) };
describe("使用统计", () => {
  it("uses settings title, shows known amounts separately and shows mixed compact logs and toggles the whole detail table", async () => {
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={data} />);
    expect(screen.getByRole("heading", { name: "使用统计" })).toBeInTheDocument();
    expect(screen.getByText("已知费用")).toBeInTheDocument();
    expect(screen.getByText(/另有 1 次请求缺少费用依据/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "使用概览" })).getByText("$0.12")).toBeInTheDocument();
    expect(screen.queryByText("活动分析")).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: "请求日志" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["时间", "类型", "对象", "会话", "Token", "费用", "耗时", "状态"]);
    expect(within(table).getByText("read_file")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).queryByRole("button", { name: /费用明细/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "显示明细" }));
    expect(screen.queryByRole("table", { name: "请求日志" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "显示记录" }));
    expect(screen.getByRole("table", { name: "请求日志" })).toBeInTheDocument();
  });
  it("sends search to the full query and preserves status and search on pagination", async () => {
    const refresh = vi.fn(); const next = vi.fn();
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={{ ...data, rowsPage: { page: 1, pageSize: 10, totalRows: 21, totalPages: 3 } }} onRefresh={refresh} onRequestPageChange={next} />);
    await userEvent.click(screen.getByRole("button", { name: "筛选状态" }));
    await userEvent.click(screen.getByRole("option", { name: "失败" }));
    await userEvent.type(screen.getByLabelText("搜索使用记录"), "deepseek");
    await waitFor(() => expect(refresh).toHaveBeenLastCalledWith("month", 1, "error", "deepseek", undefined));
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(next).toHaveBeenCalledWith(2, "month", "error", "deepseek", undefined);
  });
  it("distinguishes loading and failures from an empty result", () => {
    const view = render(<UsageStatisticsPage snapshot={null} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取");
    view.rerender(<UsageStatisticsPage snapshot={null} error="读取失败" />);
    expect(screen.getByRole("alert")).toHaveTextContent("读取失败");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
  it("removes pricing UI and never reads or refreshes the catalog on entry", () => {
    const get = vi.fn(); const refresh = vi.fn();
    window.actspace = { ...window.actspace, getPricingCatalog: get, refreshPricingCatalog: refresh };
    const saved = { settings: { activity: { usage: { range: "30d", status: "all", modelFilter: "", showDetails: true, activeTab: "pricing" } } } } as unknown as SettingsV4Snapshot;
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={data} settingsV4={saved} />);
    expect(screen.getByRole("tab", { name: /请求日志/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /价目/ })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
