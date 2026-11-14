import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HarnessStatsFilter,
  HarnessStatsQueryInput,
  HarnessStatsQueryResult,
  HarnessStatsSyncStatus,
} from "@actspace/shared";
import { HARNESS_STATS_QUERY_KINDS } from "@actspace/shared";
import {
  HARNESS_STATS_JOURNAL_DEBOUNCE_MS,
  HARNESS_STATS_POLL_MS,
  useHarnessStats,
  type HarnessStatsCompare,
} from "../components/harness-stats/use-harness-stats";
import { MOCK_HARNESS_STATS_SYNC, mockHarnessStats } from "../mock/harness-stats-fixture";
import { setupBridge } from "./helpers/bridge";

const FILTER: HarnessStatsFilter = { range: "month", sessionKind: "main" };
const ALL_KINDS = [...HARNESS_STATS_QUERY_KINDS].sort();

type Live = (envelope: unknown) => void;

function install(options: { sync?: () => HarnessStatsSyncStatus; failKind?: string } = {}) {
  const queries: HarnessStatsQueryInput[] = [];
  let live: Live | null = null;
  const sync = () => options.sync?.() ?? MOCK_HARNESS_STATS_SYNC;
  const getStatus = vi.fn(async () => sync());
  const cancel = vi.fn(async () => undefined);
  setupBridge({
    "harnessStats.query": async (input: HarnessStatsQueryInput) => {
      queries.push(input);
      if (options.failKind === input.kind) throw new Error("读取失败");
      const result = await mockHarnessStats(input);
      return result
        ? ({ ...result, dataVersion: sync().dataVersion, sync: sync() } as HarnessStatsQueryResult)
        : result;
    },
    "harnessStats.getStatus": getStatus,
    "harnessStats.cancel": cancel,
    "events.sessionLive": ((listener: Live) => {
      live = listener;
      return () => {
        live = null;
      };
    }) as never,
  });
  return {
    queries,
    getStatus,
    cancel,
    kinds: (from = 0) =>
      queries
        .slice(from)
        .map((item) => item.kind)
        .sort(),
    journal: () =>
      act(() => {
        live?.({ event: { kind: "journal-update" } });
      }),
    delta: () =>
      act(() => {
        live?.({ event: { kind: "assistant-delta" } });
      }),
  };
}

const allReady = (current: ReturnType<typeof useHarnessStats>) =>
  [
    current.options,
    current.overview,
    current.usageVs,
    current.context,
    current.disclosure,
    current.plugins,
    current.versions,
  ].every((view) => view.status === "ready");

describe("useHarnessStats", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("打开时 7 块并行查询，每块只查一次；重渲染命中缓存", async () => {
    const stub = install();
    const { result, rerender } = renderHook(() => useHarnessStats({ filter: FILTER }));
    // 第一轮同步发出：在任何结果回来之前 7 个请求都已经在飞。
    expect(stub.kinds()).toEqual(ALL_KINDS);
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    expect(stub.queries).toHaveLength(7);
    expect(stub.queries.find((item) => item.kind === "options")!.filter).toEqual({
      range: "total",
      sessionKind: "all",
    });
    rerender();
    expect(stub.queries).toHaveLength(7);
  });

  it("改筛选：除选项外 6 块用新筛选重查；改回原筛选时之前的结果已作废、重新查", async () => {
    const stub = install();
    const { result, rerender } = renderHook(
      (props: { filter: HarnessStatsFilter }) => useHarnessStats({ filter: props.filter }),
      { initialProps: { filter: FILTER } },
    );
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    const before = stub.queries.length;
    rerender({ filter: { ...FILTER, range: "week" } });
    expect(result.current.overview.status).toBe("loading");
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    const fresh = stub.queries.slice(before);
    expect(fresh.map((item) => item.kind).sort()).toEqual(ALL_KINDS.filter((kind) => kind !== "options"));
    expect(fresh.every((item) => item.filter.range === "week")).toBe(true);
  });

  it("改版本对比只重查 versions，并带上 compare", async () => {
    const stub = install();
    const { result, rerender } = renderHook(
      (props: { compare?: HarnessStatsCompare }) => useHarnessStats({ filter: FILTER, compare: props.compare }),
      { initialProps: {} },
    );
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    const before = stub.queries.length;
    rerender({ compare: { from: "default@10", to: "default@12" } });
    await waitFor(() => expect(result.current.versions.data?.from).toBe("default@10"));
    expect(stub.kinds(before)).toEqual(["versions"]);
    expect(stub.queries.at(-1)!.compare).toEqual({ from: "default@10", to: "default@12" });
  });

  it("筛选变化时取消还在飞的旧请求", async () => {
    const stub = install();
    const { result, rerender } = renderHook(
      (props: { filter: HarnessStatsFilter }) => useHarnessStats({ filter: props.filter }),
      { initialProps: { filter: FILTER } },
    );
    rerender({ filter: { ...FILTER, range: "day" } });
    expect(stub.cancel).toHaveBeenCalledTimes(6);
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    expect(result.current.overview.data?.metrics?.requests).toBe(Math.round(1204 / 30));
  });

  it("只有 journal-update 触发刷新，2 秒防抖，流式增量被忽略；刷新不查选项", async () => {
    const stub = install();
    const { result } = renderHook(() => useHarnessStats({ filter: FILTER }));
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    const before = stub.queries.length;

    stub.delta();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARNESS_STATS_JOURNAL_DEBOUNCE_MS + 100);
    });
    expect(stub.queries.length).toBe(before);

    stub.journal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    stub.journal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(stub.queries.length).toBe(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    await waitFor(() => expect(stub.queries.length).toBe(before + 6));
    expect(stub.kinds(before)).toEqual(ALL_KINDS.filter((kind) => kind !== "options"));
  });

  it("syncing 时每秒轮询状态，dataVersion 变了就重查，结束后停止轮询", async () => {
    let phase: HarnessStatsSyncStatus["phase"] = "syncing";
    let version = 1;
    const stub = install({
      sync: () => ({
        ...MOCK_HARNESS_STATS_SYNC,
        phase,
        dataVersion: version,
        completedSessions: 3,
        totalSessions: 10,
      }),
    });
    const { result } = renderHook(() => useHarnessStats({ filter: FILTER }));
    await waitFor(() => expect(result.current.sync?.phase).toBe("syncing"));
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    const before = stub.queries.length;

    version = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS + 50);
    });
    expect(stub.getStatus).toHaveBeenCalled();
    await waitFor(() => expect(stub.kinds(before)).toEqual(ALL_KINDS));

    phase = "idle";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS + 50);
    });
    await waitFor(() => expect(result.current.sync?.phase).toBe("idle"));
    const calls = stub.getStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS * 3);
    });
    expect(stub.getStatus.mock.calls.length).toBe(calls);
  });

  it("空库首次补历史：dataVersion 从 0 变成 1 时 7 块各重查一次，之后不再反复查", async () => {
    let phase: HarnessStatsSyncStatus["phase"] = "syncing";
    let version = 0;
    const stub = install({
      sync: () => ({ ...MOCK_HARNESS_STATS_SYNC, phase, dataVersion: version, completedSessions: 0, totalSessions: 1 }),
    });
    const { result } = renderHook(() => useHarnessStats({ filter: FILTER }));
    await waitFor(() => expect(allReady(result.current)).toBe(true));
    const before = stub.queries.length;
    expect(before).toBe(7);

    version = 1;
    phase = "idle";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS + 50);
    });
    await waitFor(() => expect(result.current.sync?.phase).toBe("idle"));
    await waitFor(() => expect(stub.kinds(before)).toEqual(ALL_KINDS));
    await waitFor(() => expect(allReady(result.current)).toBe(true));

    const after = stub.queries.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS * 5);
    });
    expect(stub.queries.length).toBe(after);
  });

  it("一块失败只影响那一块，错误文案透出，刷新重查 7 块", async () => {
    const stub = install({ failKind: "plugins" });
    const { result } = renderHook(() => useHarnessStats({ filter: FILTER }));
    await waitFor(() => expect(result.current.plugins.status).toBe("error"));
    expect(result.current.plugins.error).toContain("读取失败");
    await waitFor(() => expect(result.current.overview.status).toBe("ready"));
    const before = stub.queries.length;
    act(() => result.current.refresh());
    await waitFor(() => expect(stub.kinds(before)).toEqual(ALL_KINDS));
  });

  it("Electron 的 invoke 前缀换成可读的文案", async () => {
    setupBridge({
      "harnessStats.query": async () => {
        throw new Error("Error invoking remote method 'harnessStats:query': boom");
      },
      "harnessStats.getStatus": async () => MOCK_HARNESS_STATS_SYNC,
      "harnessStats.cancel": async () => undefined,
    });
    const { result } = renderHook(() => useHarnessStats({ filter: FILTER }));
    await waitFor(() => expect(result.current.overview.status).toBe("error"));
    expect(result.current.overview.error).toBe("Harness 统计读取失败，请重试。");
  });
});
