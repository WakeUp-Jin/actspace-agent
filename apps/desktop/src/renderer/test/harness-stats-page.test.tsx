import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HarnessStatsQueryInput, HarnessStatsQueryResult } from "@actspace/shared";
import { HarnessStatsPage } from "../components/harness-stats/HarnessStatsPage";
import { linearTicks, niceCeil, placeLabels } from "../components/harness-stats/harness-stats-chart-model";
import { DASH, bucketSegments, callRate, costPerCall, fmtApproxDuration, fmtInt, fmtPct, fmtSignedPct, fmtTokens, revisionLabel } from "../components/harness-stats/harness-stats-format";
import { MOCK_HARNESS_STATS_SYNC, mockHarnessStats } from "../mock/harness-stats-fixture";
import { setupBridge } from "./helpers/bridge";

type Patch = (result: HarnessStatsQueryResult) => HarnessStatsQueryResult;

function install(patch?: Patch) {
  const queries: HarnessStatsQueryInput[] = [];
  setupBridge({
    "harnessStats.query": async (input: HarnessStatsQueryInput) => {
      queries.push(input);
      const result = (await mockHarnessStats(input))!;
      return patch ? patch(result) : result;
    },
    "harnessStats.getStatus": async () => MOCK_HARNESS_STATS_SYNC,
    "harnessStats.cancel": async () => undefined,
  });
  return queries;
}

describe("harness-stats 格式化", () => {
  it("null 与非有限数都显示「—」", () => {
    expect([fmtInt(null), fmtPct(undefined), fmtSignedPct(Number.NaN), fmtTokens(null), fmtApproxDuration(null)]).toEqual([DASH, DASH, DASH, DASH, DASH]);
  });
  it("比例按 0–1 转百分数，分位数写「约」", () => {
    expect(fmtPct(0.713)).toBe("71.3%");
    expect(fmtSignedPct(-0.062)).toBe("-6.2%");
    expect(fmtSignedPct(0.032)).toBe("+3.2%");
    expect(fmtTokens(13400)).toBe("13.4k");
    expect(fmtApproxDuration(8192)).toBe("约 8.19s");
  });
  it("版本标签、调用率和每次调用摊的定义成本", () => {
    expect(revisionLabel("actspace-harness@8")).toBe("r8");
    expect(callRate(2, 4812)).toBeCloseTo(0.000416, 5);
    expect(callRate(2, 0)).toBeNull();
    expect(costPerCall(1580, 4812, 2)).toBe(3_801_480);
    expect(costPerCall(null, 10, 2)).toBeNull();
    expect(costPerCall(100, 10, 0)).toBeNull();
  });
  it("6 个桶按注册表顺序，占比合计为 1", () => {
    const segments = bucketSegments([{ bucket: "tools", avgTokens: 300 }, { bucket: "conversation", avgTokens: 700 }]);
    expect(segments.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1, 5);
    expect(segments.every((item) => item.colorVar.includes("--act-context-"))).toBe(true);
  });
});

describe("harness-stats 图表模型", () => {
  it("刻度向上取整到好看的数", () => {
    expect(niceCeil(87)).toBeGreaterThanOrEqual(87);
    const ticks = linearTicks(233);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(233);
  });
  it("标签放置不重叠，且都在边界内", () => {
    const points = Array.from({ length: 8 }, (_, index) => ({ id: `tool-${index}`, x: 100 + index * 6, y: 80 + (index % 2) * 4, priority: index }));
    const placed = placeLabels(points, { width: 400, height: 200 });
    expect(placed.length).toBeLessThanOrEqual(points.length);
    for (const label of placed) {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x).toBeLessThanOrEqual(400);
    }
  });
});

describe("Harness 统计页", () => {
  it("首屏只查 summary、options 和总览，4 张指标卡来自 summary", async () => {
    const queries = install();
    render(<HarnessStatsPage />);
    const overview = await screen.findByRole("region", { name: "Harness 概览" });
    await waitFor(() => expect(within(overview).getByText("工具调用")).toBeInTheDocument());
    await screen.findByText("bash 失败率 7.6%");
    expect([...new Set(queries.map((item) => item.kind))].sort()).toEqual(["options", "overview", "summary"]);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["总览", "插件", "工具", "上下文与 Skills", "披露与压缩", "运行", "版本对比"]);
  });

  it("点到哪个 tab 才查哪个", async () => {
    const queries = install();
    render(<HarnessStatsPage />);
    await screen.findByText("bash 失败率 7.6%");
    expect(queries.some((item) => item.kind === "runtime")).toBe(false);
    await userEvent.click(screen.getByRole("tab", { name: /^运行/ }));
    await waitFor(() => expect(queries.some((item) => item.kind === "runtime")).toBe(true));
    expect(queries.some((item) => item.kind === "tools")).toBe(false);
  });

  it("点「值得关注」跳到对应 tab", async () => {
    install();
    render(<HarnessStatsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /bash 失败率 7\.6%/ }));
    expect(await screen.findByRole("table", { name: "工具列表" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^工具/ })).toHaveAttribute("aria-selected", "true");
  });

  it("插件行展开后显示它的服务和监听", async () => {
    install();
    render(<HarnessStatsPage initialTab="plugins" />);
    const table = await screen.findByRole("table", { name: "插件列表" });
    await userEvent.click(within(table).getByRole("button", { name: /actspace\.sandbox/ }));
    expect(await screen.findAllByText(/exec/)).not.toHaveLength(0);
  });

  it("运行时统计受限与为空时给出说明", async () => {
    install((result) => result.data.kind === "plugins" ? { ...result, data: { kind: "plugins", value: { ...result.data.value, runtimeFilterLimited: true } } } : result);
    const view = render(<HarnessStatsPage initialTab="plugins" />);
    expect(await screen.findByText(/服务、监听、加载只支持按时间和版本筛选/)).toBeInTheDocument();
    view.unmount();
    install((result) => result.data.kind === "plugins" ? { ...result, data: { kind: "plugins", value: { ...result.data.value, runtimeEmpty: true, services: [], listeners: [], dependencies: [] } } } : result);
    render(<HarnessStatsPage initialTab="plugins" />);
    expect(await screen.findByText(/还没有运行时统计/)).toBeInTheDocument();
  });

  it("估算准确度：长模型名可截断并带全文提示，偏差百分比单独保留；标签列不被压缩", async () => {
    install();
    render(<HarnessStatsPage initialTab="context" />);
    const card = (await screen.findByRole("heading", { name: /估算准确度/ })).parentElement!;
    const model = within(card).getByTitle("anthropic/claude-haiku-5.5");
    expect(model).toHaveClass("truncate");
    expect(model.nextElementSibling).toHaveTextContent("（+38.4%）");
    expect(model.nextElementSibling).toHaveClass("flex-none");
    const label = within(card).getByText("偏差最大的模型");
    expect(label).toHaveClass("flex-none");
    expect(label.parentElement).toHaveClass("flex-wrap");
  });

  it("工具列表可排序", async () => {
    install();
    render(<HarnessStatsPage initialTab="tools" />);
    const table = await screen.findByRole("table", { name: "工具列表" });
    const firstRow = () => within(table).getAllByRole("row")[1]!;
    const header = within(table).getAllByRole("columnheader").find((cell) => /^调用/.test(cell.textContent ?? ""))!;
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(firstRow()).toHaveTextContent("plugin_manager");
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(firstRow()).toHaveTextContent("read_file");
  });

  it("空值显示「—」", async () => {
    install((result) => result.data.kind === "tools"
      ? { ...result, data: { kind: "tools", value: { ...result.data.value, rows: result.data.value.rows.map((row) => ({ ...row, durationP50Ms: null, durationP95Ms: null, lastUsedAt: null })) } } }
      : result);
    render(<HarnessStatsPage initialTab="tools" />);
    const table = await screen.findByRole("table", { name: "工具列表" });
    expect(within(table).getAllByText(DASH).length).toBeGreaterThan(5);
  });

  it("同步中显示进度，失败时显示错误并可重试", async () => {
    install((result) => ({ ...result, sync: { ...MOCK_HARNESS_STATS_SYNC, phase: "syncing", completedSessions: 3, totalSessions: 10 } }));
    const view = render(<HarnessStatsPage />);
    expect(await screen.findByText(/正在补齐历史 · 已读 3 \/ 10 个会话/)).toBeInTheDocument();
    view.unmount();
    const retry = vi.fn();
    install((result) => { retry(); return { ...result, sync: { ...MOCK_HARNESS_STATS_SYNC, phase: "failed", error: "磁盘已满" } }; });
    render(<HarnessStatsPage />);
    expect(await screen.findByText(/统计同步失败：磁盘已满/)).toBeInTheDocument();
    const calls = retry.mock.calls.length;
    await userEvent.click(screen.getAllByRole("button", { name: "重试" })[0]!);
    await waitFor(() => expect(retry.mock.calls.length).toBeGreaterThan(calls));
  });
});
