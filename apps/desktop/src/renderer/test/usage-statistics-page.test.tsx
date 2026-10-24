import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsageStatisticsPage } from "../components/UsageStatisticsPage";
import { mockUsageActivity } from "./fixtures/usageStatisticsFixture";
import type { SettingsV4Snapshot, UsageActivitySnapshot } from "@actspace/shared";
import { overrideBridge } from "./helpers/bridge";

const data: UsageActivitySnapshot = { ...mockUsageActivity, costSummary: { costUsd: 0.123456, knownCostRequestCount: 2, unknownCostRequestCount: 1, unverifiedHistoricalRequestCount: 0 }, rows: mockUsageActivity.rows.map((row) => row.costUsd === null ? row : { ...row, costAmount: row.costUsd, costCurrency: "USD", costBasis: "estimated" }) };
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
  it("shows unknown token usage as unknown while keeping an explicit zero visible", async () => {
    const allUnknown = {
      ...data,
      summary: { ...data.summary, requestCount: 1, totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, unknownTokenRequestCounts: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, reasoning: 1, total: 1 } },
      aggregates: { providers: [{ key: "deepseek", label: "DeepSeek", providerId: "deepseek", count: 1, errorCount: 0, totalTokens: 0, unknownTokenRequestCount: 1, durationMs: 0, costSummary: data.costSummary! }], models: [], tools: [] },
    } as unknown as UsageActivitySnapshot;
    const view = render(<UsageStatisticsPage snapshot={null} activitySnapshot={allUnknown} />);
    const metric = screen.getByText("Token 用量").parentElement;
    expect(metric).toHaveTextContent("—");
    expect(metric).toHaveTextContent("1 次请求 Token 用量未知");
    expect(screen.getByText("缓存命中率").parentElement).toHaveTextContent("—");

    await userEvent.click(screen.getByRole("tab", { name: /服务商/ }));
    const providerRow = within(screen.getByRole("table")).getByRole("row", { name: /DeepSeek/ });
    expect(providerRow).toHaveTextContent("—");
    expect(providerRow).toHaveTextContent("1 次请求用量未知");

    const knownZero = { ...allUnknown, summary: { ...allUnknown.summary, unknownTokenRequestCounts: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 } }, aggregates: { ...allUnknown.aggregates, providers: [{ ...allUnknown.aggregates!.providers[0]!, unknownTokenRequestCount: 0 }] } } as unknown as UsageActivitySnapshot;
    view.rerender(<UsageStatisticsPage snapshot={null} activitySnapshot={knownZero} />);
    expect(screen.getByText("Token 用量").parentElement).toHaveTextContent("0");
    expect(within(screen.getByRole("table")).getByRole("row", { name: /DeepSeek/ })).toHaveTextContent("0");
    view.unmount();
  });
  it("labels mixed token totals as a known subtotal and hides incomplete cache rates", () => {
    const mixed = {
      ...data,
      summary: { ...data.summary, requestCount: 2, totalTokens: 12, inputTokens: 4, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0, unknownTokenRequestCounts: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, reasoning: 1, total: 1 } },
      aggregates: { providers: [{ key: "deepseek", label: "DeepSeek", providerId: "deepseek", count: 2, errorCount: 0, totalTokens: 12, unknownTokenRequestCount: 1, durationMs: 0, costSummary: data.costSummary! }], models: [], tools: [] },
    } as unknown as UsageActivitySnapshot;
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={mixed} />);
    const totalMetric = screen.getByText("已知 Token 合计").parentElement;
    expect(totalMetric).toHaveTextContent("12");
    expect(totalMetric).toHaveTextContent("1 次请求 Token 用量未知");
    const cacheMetric = screen.getByText("缓存命中率").parentElement;
    expect(cacheMetric).toHaveTextContent("—");
  });
  it("sends search to the full query and preserves status and search on pagination", async () => {
    const refresh = vi.fn(); const next = vi.fn();
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={{ ...data, rowsPage: { page: 1, pageSize: 10, totalRows: 21, totalPages: 3 } }} onRefresh={refresh} onRequestPageChange={next} />);
    await userEvent.click(screen.getByRole("combobox", { name: "筛选状态" }));
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
  it("shows Session fallback separately from an empty result", () => {
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={{ ...data, readModel: { source: "session", status: "fallback" } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("当前结果从会话记录读取");
    expect(screen.getByRole("table", { name: "请求日志" })).toBeInTheDocument();
  });
  it("makes incomplete statistics explicit when some Sessions cannot be read", () => {
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={{ ...data, readModel: { source: "sqlite", status: "ready", failedSources: 2 } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 个会话暂时无法读取");
    expect(screen.getByRole("status")).toHaveTextContent("当前统计不包含这些会话");
  });
  it("shows synchronization progress and cancels the active query", async () => {
    const cancel = vi.fn();
    render(<UsageStatisticsPage snapshot={null} isLoading progress={{ requestId: "q", phase: "syncing", completedSessions: 2, totalSessions: 8, eventsRead: 256 }} onCancel={cancel} />);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("256");
    await userEvent.click(screen.getByRole("button", { name: "取消查询" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("removes pricing UI and never reads or refreshes the catalog on entry", () => {
    const get = vi.fn(); const refresh = vi.fn();
    overrideBridge({ "models.getPricingCatalog": get, "models.refreshPricingCatalog": refresh });
    const saved = { settings: { activity: { usage: { range: "30d", status: "all", modelFilter: "", showDetails: true, activeTab: "pricing" } } } } as unknown as SettingsV4Snapshot;
    render(<UsageStatisticsPage snapshot={null} activitySnapshot={data} settingsV4={saved} />);
    expect(screen.getByRole("tab", { name: /请求日志/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /价目/ })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
