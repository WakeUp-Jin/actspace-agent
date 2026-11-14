import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HarnessStatsQueryInput, HarnessStatsQueryResult } from "@actspace/shared";
import { HARNESS_STATS_QUERY_KINDS } from "@actspace/shared";
import { HarnessStatsPage } from "../components/harness-stats/HarnessStatsPage";
import {
  bucketSegments,
  costPerUse,
  fmtPoints,
  fmtSignedTokens,
  revisionLabel,
  usageVerdict,
} from "../components/harness-stats/harness-stats-format";
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

const card = (name: string) => screen.getByRole("region", { name });
const metrics = () => screen.getByRole("region", { name: "Harness 指标" });
const metric = (label: string) => within(metrics()).getByText(label).closest("button")!;
const detailTab = (name: RegExp) =>
  within(screen.getByRole("tablist", { name: "Harness 明细" })).getByRole("tab", { name });
const header = (table: HTMLElement, label: string) =>
  within(table)
    .getAllByRole("columnheader")
    .find((cell) => cell.textContent === label)!;
const firstCell = (table: HTMLElement) =>
  within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[0].textContent;

async function ready() {
  render(<HarnessStatsPage />);
  await screen.findByRole("region", { name: "值得关注" });
  await screen.findByRole("table", { name: "工具明细" });
  await within(card("插件运行时")).findByText("调用最多的服务");
  await within(card("版本对比")).findByRole("table", { name: "版本对比" });
}

describe("harness-stats 格式化", () => {
  it("判断胶囊、每用一次的成本和带符号的差", () => {
    expect(usageVerdict(0, 3842, 650)).toBe("dead");
    expect(usageVerdict(4, 3842, 480)).toBe("hot");
    expect(usageVerdict(4, 3842, 200)).toBe("ok");
    expect(costPerUse(1100, 3842, 3214)).toBeCloseTo(1315, 0);
    expect(costPerUse(650, 3842, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(fmtSignedTokens(-1700)).toBe("−1.7k");
    expect(fmtPoints(0.013)).toBe("+1.3 点");
    expect(revisionLabel("default@11")).toBe("@11");
  });
  it("6 类上下文按注册表顺序，用规范里的名字和 context 色", () => {
    const segments = bucketSegments([
      { bucket: "conversation", avgTokens: 700 },
      { bucket: "rules", avgTokens: 300 },
    ]);
    expect(segments.map((item) => item.label)).toEqual(["规则与注入", "对话"]);
    expect(segments.every((item) => item.colorVar.startsWith("--act-context-"))).toBe(true);
  });
});

describe("Harness 统计页", () => {
  it("打开时 7 块并行查询；工具条没有工作区筛选，会话类型默认主会话", async () => {
    const queries = install();
    await ready();
    expect([...new Set(queries.map((item) => item.kind))].sort()).toEqual([...HARNESS_STATS_QUERY_KINDS].sort());
    expect(queries).toHaveLength(7);
    expect(screen.queryByRole("combobox", { name: "筛选工作区" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "筛选会话类型" })).toHaveTextContent("主会话");
    expect(screen.getByRole("radio", { name: "30 天" })).toHaveAttribute("aria-checked", "true");
  });

  it("改筛选后用新筛选重查", async () => {
    const queries = install();
    await ready();
    const before = queries.length;
    await userEvent.click(screen.getByRole("combobox", { name: "筛选会话类型" }));
    await userEvent.click(screen.getByRole("option", { name: "子 Agent" }));
    await waitFor(() =>
      expect(
        queries
          .slice(before)
          .map((item) => item.kind)
          .sort(),
      ).toEqual(HARNESS_STATS_QUERY_KINDS.filter((kind) => kind !== "options").sort()),
    );
    expect(queries.slice(before).every((item) => item.filter.sessionKind === "child")).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "7 天" }));
    await waitFor(() => expect(queries.at(-1)!.filter).toMatchObject({ range: "week", sessionKind: "child" }));
  });

  it("没有值得关注时整块不显示", async () => {
    install((result) =>
      result.data.kind === "overview"
        ? { ...result, data: { kind: "overview", value: { ...result.data.value, flags: [] } } }
        : result,
    );
    render(<HarnessStatsPage />);
    await within(metrics()).findByText("比 @11 −2.5k");
    expect(screen.queryByRole("region", { name: "值得关注" })).not.toBeInTheDocument();
  });

  it("值得关注：工具失败率跳到工具明细并按失败率倒序", async () => {
    install();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /工具失败率高：bash/ }));
    expect(detailTab(/^工具/)).toHaveAttribute("aria-selected", "true");
    const table = screen.getByRole("table", { name: "工具明细" });
    expect(header(table, "失败率")).toHaveAttribute("aria-sort", "descending");
    expect(firstCell(table)).toBe("plugin_manager");
  });

  it("值得关注：插件加载失败切到运行时的加载 tab，并显示最近一次失败", async () => {
    install();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /插件加载失败：review-helper/ }));
    const runtime = card("插件运行时");
    expect(within(runtime).getByRole("tab", { name: "加载" })).toHaveAttribute("aria-selected", "true");
    expect(within(runtime).getByText("最近一次失败")).toBeInTheDocument();
    expect(within(runtime).getByText(/review-helper: 缺少服务 actspace\.review/)).toBeInTheDocument();
  });

  it("值得关注：上下文来源变化频繁选中该类别；占用少用展开对应行", async () => {
    install();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /上下文来源变化频繁：environment/ }));
    const sources = card("来源 · 规则与注入");
    expect(within(sources).getAllByText("常变 · 打断缓存")).toHaveLength(2); // environment 61%、active-paths 34%
    await userEvent.click(screen.getByRole("button", { name: /notebook_edit 占用高、使用少/ }));
    const row = within(card("占用 vs 使用")).getByRole("button", { name: /notebook_edit/, expanded: true });
    expect(within(row).getByText("建议")).toBeInTheDocument();
    expect(within(row).getByText("一直占着上下文，一次没用")).toBeInTheDocument();
  });

  it("指标卡：都比上一版本低时全绿", async () => {
    install();
    await ready();
    expect(within(metric("Harness 固定开销")).getByText("比 @11 −2.5k")).toHaveClass("text-operational");
    expect(within(metric("缓存被打断")).getByText("比 @11 −3.3 点")).toHaveClass("text-operational");
    expect(within(metric("工具失败率")).getByText("比 @11 −0.7 点")).toHaveClass("text-operational");
    expect(within(metric("压缩后重读率")).getByText("比 @11 −6 点")).toHaveClass("text-operational");
    expect(metric("缓存被打断")).toHaveTextContent("这些请求缓存命中 41%，其他 89%");
    expect(metric("Harness 固定开销")).toHaveTextContent("占窗口 9.2%");
  });

  it("指标卡：变高为红、持平为灰；没有上一版本时写明", async () => {
    install((result) => {
      if (result.data.kind !== "overview") return result;
      const { metrics: current, previousMetrics: previous } = result.data.value;
      // 交换两个版本：现在比上一版本差；失败率设成相同。
      return {
        ...result,
        data: {
          kind: "overview",
          value: {
            ...result.data.value,
            metrics: { ...previous!, toolFailureRate: 0.04 },
            previousMetrics: { ...current!, toolFailureRate: 0.04 },
          },
        },
      };
    });
    render(<HarnessStatsPage />);
    expect(await within(metrics()).findByText("比 @11 +2.5k")).toHaveClass("text-on-danger");
    expect(within(metric("工具失败率")).getByText("比 @11 持平")).toHaveClass("text-text-faint");

    install();
    render(<HarnessStatsPage />);
    await screen.findAllByRole("region", { name: "值得关注" });
    const toolbar = screen.getAllByRole("group", { name: "统计筛选" }).at(-1)!;
    await userEvent.click(within(toolbar).getByRole("combobox", { name: "筛选版本" }));
    await userEvent.click(await screen.findByRole("option", { name: "版本 @10" }));
    const last = screen.getAllByRole("region", { name: "Harness 指标" }).at(-1)!;
    await waitFor(() => expect(within(last).getAllByText("没有上一个版本可比")).toHaveLength(5));
    expect(within(last).getAllByText("没有上一个版本可比")[0]).toHaveClass("text-text-faint");
  });

  it("指标卡点击：白费的工具调用跳到工具明细按重复倒序", async () => {
    install();
    await ready();
    await userEvent.click(detailTab(/^插件/));
    await userEvent.click(metric("白费的工具调用"));
    const table = screen.getByRole("table", { name: "工具明细" });
    expect(header(table, "同参数重复")).toHaveAttribute("aria-sort", "descending");
    expect(firstCell(table)).toBe("bash");
  });

  it("占用 vs 使用：先显示 7 行，可显示全部；点行展开；Skills 用「读取」", async () => {
    install();
    await ready();
    const usage = card("占用 vs 使用");
    const list = () => within(usage).getByRole("list");
    expect(within(list()).getAllByRole("listitem")).toHaveLength(7);
    // 按每用一次的成本倒序：从未调用的排最前。
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent("notebook_edit");
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent("一次没调用");
    expect(within(list()).getAllByRole("listitem")[1]).toHaveTextContent("plugin_manager");
    expect(within(list()).getAllByRole("listitem")[1]).toHaveTextContent("占用高 · 少用");
    expect(within(list()).getAllByRole("listitem")[1]).toHaveTextContent("token / 每调用一次");
    expect(within(list()).getAllByRole("listitem")[1]).toHaveTextContent(
      "每次请求带着 1,350 token × 3,842 次请求 = 5.2M，调用了 2 次",
    );

    await userEvent.click(within(usage).getByRole("button", { name: "显示全部 15 个" }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(15);

    const bash = within(usage).getByRole("button", { name: /^\d+ bash / });
    expect(bash).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(bash);
    expect(bash).toHaveAttribute("aria-expanded", "true");
    expect(within(bash).getByText("所属插件")).toBeInTheDocument();
    expect(within(bash).getByText("调用率")).toBeInTheDocument();

    await userEvent.click(within(usage).getByRole("tab", { name: "Skills" }));
    expect(within(usage).getByText(/除以真正读取的次数/)).toBeInTheDocument();
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent("pdf-reader");
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent("一次没读取");
    expect(within(list()).getAllByRole("listitem")[1]).toHaveTextContent("token / 每读取一次");

    await userEvent.click(within(usage).getByRole("tab", { name: "插件" }));
    expect(within(usage).getByRole("button", { name: "显示全部 10 个" })).toBeInTheDocument();
  });

  it("点上下文类别，来源卡只看这一类；看全部恢复", async () => {
    install();
    await ready();
    expect(card("最大的上下文来源")).toBeInTheDocument();
    await userEvent.click(within(card("每次请求里放了什么")).getByRole("button", { name: /工具定义/ }));
    const sources = card("来源 · 工具定义");
    const names = within(within(sources).getByRole("list", { name: "上下文来源" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    expect(names).toHaveLength(6);
    expect(names.every((name) => name.startsWith("tools · "))).toBe(true);
    await userEvent.click(within(sources).getByRole("button", { name: /看全部/ }));
    expect(card("最大的上下文来源")).toBeInTheDocument();
  });

  it("明细 5 个 tab：默认排序与点表头切换", async () => {
    install();
    await ready();
    const cases: ReadonlyArray<readonly [RegExp, string, string, string]> = [
      [/^工具/, "工具明细", "调用", "bash"],
      [/^插件/, "插件明细", "占上下文", "filesystem-read"],
      [/^上下文来源/, "上下文来源明细", "平均大小", "工具结果"],
      [/^Skills/, "Skills 明细", "读 SKILL.md", "baoyu-design"],
      [/^压缩记录/, "压缩记录", "时间", "11-"],
    ];
    for (const [tab, name, column, first] of cases) {
      await userEvent.click(detailTab(tab));
      const table = screen.getByRole("table", { name });
      expect(header(table, column)).toHaveAttribute("aria-sort", "descending");
      if (name !== "压缩记录") expect(firstCell(table)).toBe(first);
    }
    // 压缩记录默认时间倒序：第一行是最近的一次。
    const records = screen.getByRole("table", { name: "压缩记录" });
    const times = within(records)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
    expect([...times].sort().reverse()).toEqual(times);

    await userEvent.click(detailTab(/^工具/));
    const tools = screen.getByRole("table", { name: "工具明细" });
    const calls = header(tools, "调用");
    await userEvent.click(within(calls).getByRole("button"));
    expect(calls).toHaveAttribute("aria-sort", "ascending");
    expect(firstCell(tools)).toBe("notebook_edit");
    await userEvent.click(within(header(tools, "定义（token）")).getByRole("button"));
    expect(header(tools, "定义（token）")).toHaveAttribute("aria-sort", "descending");
    expect(firstCell(tools)).toBe("plugin_manager");
  });

  it("版本对比：两个下拉，改了带 compare 重查；样本少时提示", async () => {
    const queries = install();
    await ready();
    const versions = card("版本对比");
    expect(within(versions).getByRole("combobox", { name: "对比的旧版本" })).toHaveTextContent("@11");
    expect(within(versions).getByRole("combobox", { name: "对比的新版本" })).toHaveTextContent("@12");
    const row = within(versions).getByRole("row", { name: /读取命中活跃/ });
    expect(within(row).getByText("+4 点")).toHaveAttribute("data-tone", "good");
    expect(within(within(versions).getByRole("row", { name: /插件数/ })).getByText("+1")).toHaveAttribute(
      "data-tone",
      "flat",
    );
    expect(within(within(versions).getByRole("row", { name: /工具失败率/ })).getByText("−0.7 点")).toHaveAttribute(
      "data-tone",
      "good",
    );

    await userEvent.click(within(versions).getByRole("combobox", { name: "对比的旧版本" }));
    await userEvent.click(await screen.findByRole("option", { name: /^@10/ }));
    await waitFor(() =>
      expect(queries.at(-1)).toMatchObject({ kind: "versions", compare: { from: "default@10", to: "default@12" } }),
    );
    await waitFor(() =>
      expect(within(card("版本对比")).getByText(/@10：1,904 次请求 · @12：1,204 次请求/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("radio", { name: "24 小时" }));
    await waitFor(() => expect(within(card("版本对比")).getByText(/样本偏少/)).toBeInTheDocument());
  });

  it("同步中显示进度，失败时显示错误并可重试", async () => {
    install((result) => ({
      ...result,
      sync: { ...MOCK_HARNESS_STATS_SYNC, phase: "syncing", completedSessions: 3, totalSessions: 10 },
    }));
    const view = render(<HarnessStatsPage />);
    expect(await screen.findByText(/正在补齐历史 · 已读 3 \/ 10 个会话/)).toBeInTheDocument();
    view.unmount();
    const retry = vi.fn();
    install((result) => {
      retry();
      return { ...result, sync: { ...MOCK_HARNESS_STATS_SYNC, phase: "failed", error: "磁盘已满" } };
    });
    render(<HarnessStatsPage />);
    expect(await screen.findByText(/统计同步失败：磁盘已满/)).toBeInTheDocument();
    const calls = retry.mock.calls.length;
    await userEvent.click(screen.getAllByRole("button", { name: "重试" })[0]);
    await waitFor(() => expect(retry.mock.calls.length).toBeGreaterThan(calls));
  });
});
