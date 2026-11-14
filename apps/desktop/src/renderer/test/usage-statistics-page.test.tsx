import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SettingsV4Snapshot, UsageActivityRow, UsageActivitySnapshot } from "@actspace/shared";
import { UsageStatisticsPage } from "../components/UsageStatisticsPage";
import { mockUsageActivity } from "../mock/usage-stats-fixture";
import { gapNote, rangeDays, tokenTypeSegments } from "../components/usage/usage-stats-model";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const data = mockUsageActivity({ range: "month" }, NOW);
const metric = (label: string) =>
  within(screen.getByRole("region", { name: "使用概览" }))
    .getByText(label)
    .closest("button, div")!.parentElement;
const card = (label: string) => screen.getByRole("region", { name: label });
const withSummary = (
  patch: Partial<UsageActivitySnapshot["summary"]>,
  extra: Partial<UsageActivitySnapshot> = {},
): UsageActivitySnapshot => ({ ...data, ...extra, summary: { ...data.summary, ...patch } });
const known = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 };

describe("使用统计", () => {
  it("五张指标卡、八张卡片和六个明细 tab", () => {
    render(<UsageStatisticsPage activitySnapshot={data} />);
    expect(screen.getByRole("heading", { name: "使用统计" })).toBeInTheDocument();
    const overview = screen.getByRole("region", { name: "使用概览" });
    for (const label of ["Token 用量", "费用", "缓存命中率", "模型请求", "工具调用"])
      expect(within(overview).getByText(label)).toBeInTheDocument();
    for (const title of [
      "Token 统计",
      "耗时统计",
      "用量趋势",
      "活跃度",
      "技能加载",
      "工具调用",
      "命令执行",
      "子 Agent 与辅助模型",
    ])
      expect(card(title)).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/[\d,—]+$/, ""))).toEqual(
      expect.arrayContaining(["请求明细", "模型", "提供商", "工具", "命令", "Skills"]),
    );
    expect(
      within(screen.getByRole("table", { name: "请求明细" }))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["时间", "会话", "模型", "首字", "耗时", "Token", "费用", "状态"]);
    // 去掉的旧控件。
    expect(screen.queryByLabelText("搜索使用记录")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "显示明细" })).not.toBeInTheDocument();
  });

  it("费用副行：24 小时只给每次请求，其他范围加日均；「全部」按第一条记录算天数", () => {
    const day = mockUsageActivity({ range: "day" }, NOW);
    const view = render(<UsageStatisticsPage activitySnapshot={day} settingsV4={prefs({ range: "24h" })} />);
    expect(metric("费用")).toHaveTextContent(/每次请求 \$/);
    expect(metric("费用")).not.toHaveTextContent("日均");
    view.unmount();
    render(<UsageStatisticsPage activitySnapshot={data} settingsV4={prefs({ range: "30d" })} />);
    expect(metric("费用")).toHaveTextContent(`日均 $${(data.costSummary!.costUsd / 30).toFixed(2)}`);
    expect(rangeDays("total", "2026-08-18T12:00:00.000Z", NOW)).toBe(81);
    expect(rangeDays("total", null, NOW)).toBeNull();
    expect(rangeDays("week", null, NOW)).toBe(7);
  });

  it("一个费用都不知道时写「费用未知」；全部请求缺用量时 Token 写「—」，显式 0 照常显示", () => {
    const unknownCost = {
      ...data,
      costSummary: {
        costUsd: 0,
        knownCostRequestCount: 0,
        unknownCostRequestCount: 4,
        unverifiedHistoricalRequestCount: 0,
      },
    };
    const view = render(<UsageStatisticsPage activitySnapshot={unknownCost} />);
    expect(metric("费用")).toHaveTextContent("费用未知");
    const allUnknown = withSummary({
      requestCount: 1,
      totalTokens: 0,
      unknownTokenRequestCounts: { ...known, total: 1 },
    });
    view.rerender(<UsageStatisticsPage activitySnapshot={allUnknown} />);
    expect(metric("Token 用量")).toHaveTextContent("—");
    view.rerender(
      <UsageStatisticsPage
        activitySnapshot={withSummary({ requestCount: 1, totalTokens: 0, unknownTokenRequestCounts: known })}
      />,
    );
    expect(metric("Token 用量")).not.toHaveTextContent("—");
  });

  it("缓存命中率与会话胶囊同一算法", () => {
    const summary = {
      requestCount: 2,
      inputTokens: 100,
      cacheReadTokens: 800,
      cacheWriteTokens: 100,
      unknownTokenRequestCounts: known,
    };
    const view = render(<UsageStatisticsPage activitySnapshot={withSummary(summary)} />);
    expect(metric("缓存命中率")).toHaveTextContent("80%");
    // 差一点全命中不会舍成 100%。
    view.rerender(
      <UsageStatisticsPage
        activitySnapshot={withSummary({ ...summary, inputTokens: 1, cacheReadTokens: 99_999, cacheWriteTokens: 0 })}
      />,
    );
    expect(metric("缓存命中率")).toHaveTextContent("99.999%");
  });

  it("缺口提示合成一行，悬停给原因", async () => {
    const gapped = {
      ...withSummary({ unknownTokenRequestCounts: { ...known, cacheRead: 2, total: 1 } }),
      costSummary: { ...data.costSummary!, unknownCostRequestCount: 1 },
    };
    render(<UsageStatisticsPage activitySnapshot={gapped} />);
    const note = screen.getByText("有 2 次请求缺少用量或定价，数值为已知部分的合计");
    await userEvent.hover(note);
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("请求失败或未完成：1 次");
    expect(tip).toHaveTextContent("模型未配置价格：1 次");
    expect(tip).toHaveTextContent("服务商未返回缓存字段：1 次");
    expect(
      gapNote({
        ...data,
        summary: { ...data.summary, unknownTokenRequestCounts: { ...known, cacheWrite: 3 } },
        costSummary: { ...data.costSummary!, unknownCostRequestCount: 0 },
      }),
    ).toBeNull();
  });

  it("Token 按类型：模型回复 = 输出 − 思考", () => {
    const segments = tokenTypeSegments({ ...data.summary, outputTokens: 1000, reasoningTokens: 300 });
    expect(segments.map((segment) => segment.label)).toEqual([
      "缓存读取",
      "缓存写入",
      "未缓存输入",
      "模型思考",
      "模型回复",
    ]);
    expect(segments.at(-1)!.value).toBe(700);
  });

  it("筛选变化从第一页重新查，翻页带上筛选；挂载时查一次", async () => {
    const onQuery = vi.fn();
    render(
      <UsageStatisticsPage
        activitySnapshot={{ ...data, rowsPage: { page: 1, pageSize: 20, totalRows: 45, totalPages: 3 } }}
        onQuery={onQuery}
      />,
    );
    expect(onQuery).toHaveBeenCalledWith({ range: "month", page: 1 });
    await userEvent.click(screen.getByRole("combobox", { name: "筛选模型" }));
    await userEvent.click(screen.getByRole("option", { name: "deepseek-v4" }));
    await waitFor(() => expect(onQuery).toHaveBeenLastCalledWith({ range: "month", model: "deepseek-v4", page: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onQuery).toHaveBeenLastCalledWith({ range: "month", model: "deepseek-v4", page: 2 });
    // 选了模型后，Harness 来源的卡片标明不受影响。
    expect(card("工具调用")).toHaveTextContent("不受模型、提供商筛选影响");
    expect(card("活跃度")).toHaveTextContent("不受筛选影响");
  });

  it("偏好防抖写回 activity.usage，旧值 pricing 回落请求明细", async () => {
    const update = vi.fn(async () => null);
    render(
      <UsageStatisticsPage
        activitySnapshot={data}
        settingsV4={prefs({ activeTab: "pricing" as never })}
        onUpdateNamespace={update}
      />,
    );
    expect(screen.getByRole("tab", { name: /请求明细/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: /^工具/ }));
    await userEvent.click(within(card("用量趋势")).getByRole("tab", { name: "费用" }));
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith({
        namespace: "activity",
        patch: { usage: expect.objectContaining({ activeTab: "tools", trendMetric: "cost" }) },
      }),
    );
  });

  it("点「模型请求」跳到底部模型 tab", async () => {
    render(<UsageStatisticsPage activitySnapshot={data} />);
    await userEvent.click(within(screen.getByRole("region", { name: "使用概览" })).getByText("模型请求"));
    expect(screen.getByRole("tab", { name: /^模型/ })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("table", { name: "模型" })).getByText("claude-opus-5-5")).toBeInTheDocument();
  });

  it("请求明细悬停给单价、耗时、Token、费用；未配置价格的费用写「未知」", async () => {
    const row = data.rows.find((item) => item.status === "success")!;
    const unpriced: UsageActivityRow = {
      ...row,
      activityId: "x",
      costUsd: null,
      costAmount: null,
      costCurrency: null,
      costBasis: "unavailable",
      costProvenance: { version: 1, basis: "unknown", reason: "model-price-unavailable", pricingSnapshot: null },
    };
    render(<UsageStatisticsPage activitySnapshot={{ ...data, rows: [row, unpriced] }} />);
    const table = screen.getByRole("table", { name: "请求明细" });
    await userEvent.hover(within(table).getAllByRole("button", { name: "Token 明细" })[0]);
    const tokens = await screen.findByRole("region", { name: "Token 明细" });
    expect(tokens).toHaveTextContent("缓存读取");
    expect(tokens).toHaveTextContent(row.tokens.totalTokens!.toLocaleString("zh-CN"));
    await userEvent.unhover(within(table).getAllByRole("button", { name: "Token 明细" })[0]);
    await userEvent.hover(within(table).getAllByRole("button", { name: /单价/ })[1]);
    expect(await screen.findByRole("region", { name: row.model })).toHaveTextContent("暂无单价");
    expect(within(table).getByText("未知")).toHaveAttribute("title", "该模型未配置价格");
  });

  it("工具失败率超过 5% 显示红色胶囊", () => {
    render(<UsageStatisticsPage activitySnapshot={data} />);
    const tools = within(card("工具调用")).getByRole("list", { name: "工具调用" });
    expect(within(tools).getByText("web_fetch").parentElement).toHaveTextContent("25.0%");
    expect(within(tools).getByText("read_file").parentElement).not.toHaveTextContent("%");
  });

  it("加载、失败、回退、部分会话不可读、Harness 不可用分别提示", async () => {
    const cancel = vi.fn();
    const view = render(
      <UsageStatisticsPage
        isLoading
        progress={{ requestId: "q", phase: "syncing", completedSessions: 2, totalSessions: 8, eventsRead: 256 }}
        onCancel={cancel}
      />,
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("256");
    await userEvent.click(screen.getByRole("button", { name: "取消查询" }));
    expect(cancel).toHaveBeenCalledOnce();
    view.rerender(<UsageStatisticsPage error="读取失败" />);
    expect(screen.getByRole("alert")).toHaveTextContent("读取失败");
    view.rerender(
      <UsageStatisticsPage activitySnapshot={{ ...data, readModel: { source: "session", status: "fallback" } }} />,
    );
    expect(screen.getByText(/当前结果从会话记录读取/)).toBeInTheDocument();
    view.rerender(
      <UsageStatisticsPage
        activitySnapshot={{ ...data, readModel: { source: "sqlite", status: "ready", failedSources: 2 } }}
      />,
    );
    expect(screen.getByText(/2 个会话暂时无法读取/)).toBeInTheDocument();
    view.rerender(<UsageStatisticsPage activitySnapshot={{ ...data, harnessUnavailable: true, tools: undefined }} />);
    expect(screen.getByText(/工具、命令、Skills 与子 Agent 统计暂不可用/)).toBeInTheDocument();
  });
});

function prefs(patch: Partial<SettingsV4Snapshot["settings"]["activity"]["usage"]>): SettingsV4Snapshot {
  return {
    settings: {
      activity: {
        usage: {
          range: "30d",
          activeTab: "requests",
          tokenView: "type",
          timeView: "phase",
          trendMetric: "tokens",
          heatMetric: "sessions",
          ...patch,
        },
      },
    },
  } as unknown as SettingsV4Snapshot;
}
