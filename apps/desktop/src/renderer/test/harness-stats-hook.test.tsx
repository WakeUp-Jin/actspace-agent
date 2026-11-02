import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessStatsFilter, HarnessStatsQueryInput, HarnessStatsQueryResult, HarnessStatsSyncStatus } from "@actspace/shared";
import { HARNESS_STATS_JOURNAL_DEBOUNCE_MS, HARNESS_STATS_POLL_MS, useHarnessStatsTab } from "../components/harness-stats/use-harness-stats";
import { MOCK_HARNESS_STATS_SYNC, mockHarnessStats } from "../mock/harness-stats-fixture";
import { setupBridge } from "./helpers/bridge";

const FILTER: HarnessStatsFilter = { range: "month", sessionKind: "main" };

type Live = (envelope: unknown) => void;

function install(options: { sync?: () => HarnessStatsSyncStatus; failKind?: string } = {}) {
  const queries: HarnessStatsQueryInput[] = [];
  let live: Live | null = null;
  let version = 1;
  const sync = () => options.sync?.() ?? { ...MOCK_HARNESS_STATS_SYNC, dataVersion: version };
  const getStatus = vi.fn(async () => sync());
  setupBridge({
    "harnessStats.query": async (input: HarnessStatsQueryInput) => {
      queries.push(input);
      if (options.failKind === input.kind) throw new Error("读取失败");
      const result = await mockHarnessStats(input);
      return result ? ({ ...result, dataVersion: sync().dataVersion, sync: sync() } as HarnessStatsQueryResult) : result;
    },
    "harnessStats.getStatus": getStatus,
    "harnessStats.cancel": async () => undefined,
    "events.sessionLive": ((listener: Live) => { live = listener; return () => { live = null; }; }) as never,
  });
  return {
    queries,
    getStatus,
    kinds: () => queries.map((item) => item.kind),
    bump: () => { version += 1; },
    journal: () => act(() => { live?.({ event: { kind: "journal-update" } }); }),
    delta: () => act(() => { live?.({ event: { kind: "assistant-delta" } }); }),
  };
}

describe("useHarnessStatsTab", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it("首屏只查 summary、options 和当前 tab，切 tab 时才查其他的，并复用缓存", async () => {
    const stub = install();
    const { result, rerender } = renderHook((props: { tab: "overview" | "tools" }) => useHarnessStatsTab({ filter: FILTER, tab: props.tab }), { initialProps: { tab: "overview" } });
    await waitFor(() => expect(result.current.tab.status).toBe("ready"));
    await waitFor(() => expect(result.current.summary.status).toBe("ready"));
    expect([...new Set(stub.kinds())].sort()).toEqual(["options", "overview", "summary"]);

    rerender({ tab: "tools" });
    await waitFor(() => expect(result.current.tab.data?.kind).toBe("tools"));
    expect(stub.kinds().filter((kind) => kind === "tools")).toHaveLength(1);

    const before = stub.queries.length;
    rerender({ tab: "overview" });
    await waitFor(() => expect(result.current.tab.data?.kind).toBe("overview"));
    expect(stub.queries.length).toBe(before);
  });

  it("改筛选只重查当前 tab，别的 tab 缓存作废", async () => {
    const stub = install();
    const { result, rerender } = renderHook((props: { filter: HarnessStatsFilter }) => useHarnessStatsTab({ filter: props.filter, tab: "overview" }), { initialProps: { filter: FILTER } });
    await waitFor(() => expect(result.current.tab.status).toBe("ready"));
    const before = stub.queries.length;
    rerender({ filter: { ...FILTER, range: "week" } });
    await waitFor(() => expect(stub.queries.length).toBeGreaterThan(before));
    await waitFor(() => expect(result.current.tab.status).toBe("ready"));
    const fresh = stub.queries.slice(before);
    expect(fresh.every((item) => item.filter.range === "week")).toBe(true);
    expect(fresh.map((item) => item.kind)).not.toContain("tools");
  });

  it("只有 journal-update 触发刷新，2 秒防抖，流式增量被忽略", async () => {
    const stub = install();
    const { result } = renderHook(() => useHarnessStatsTab({ filter: FILTER, tab: "overview" }));
    await waitFor(() => expect(result.current.tab.status).toBe("ready"));
    await waitFor(() => expect(result.current.summary.status).toBe("ready"));
    const before = stub.queries.length;

    stub.delta();
    await act(async () => { await vi.advanceTimersByTimeAsync(HARNESS_STATS_JOURNAL_DEBOUNCE_MS + 100); });
    expect(stub.queries.length).toBe(before);

    stub.journal();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    stub.journal();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(stub.queries.length).toBe(before);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    await waitFor(() => expect(stub.queries.length).toBe(before + 2));
    expect(stub.queries.slice(before).map((item) => item.kind).sort()).toEqual(["overview", "summary"]);
  });

  it("syncing 时轮询状态，dataVersion 变了就刷新", async () => {
    let phase: HarnessStatsSyncStatus["phase"] = "syncing";
    let version = 1;
    const stub = install({ sync: () => ({ ...MOCK_HARNESS_STATS_SYNC, phase, dataVersion: version, completedSessions: 3, totalSessions: 10 }) });
    const { result } = renderHook(() => useHarnessStatsTab({ filter: FILTER, tab: "overview" }));
    await waitFor(() => expect(result.current.sync?.phase).toBe("syncing"));
    const before = stub.queries.length;

    version = 2;
    await act(async () => { await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS + 50); });
    expect(stub.getStatus).toHaveBeenCalled();
    await waitFor(() => expect(stub.queries.length).toBeGreaterThan(before));

    phase = "idle";
    await act(async () => { await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS + 50); });
    await waitFor(() => expect(result.current.sync?.phase).toBe("idle"));
    const calls = stub.getStatus.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS * 3); });
    expect(stub.getStatus.mock.calls.length).toBe(calls);
  });

  it("空库首次补历史：dataVersion 从 0 变成 1 时自动重查一次，之后不再反复查", async () => {
    let phase: HarnessStatsSyncStatus["phase"] = "syncing";
    let version = 0;
    const stub = install({ sync: () => ({ ...MOCK_HARNESS_STATS_SYNC, phase, dataVersion: version, completedSessions: 0, totalSessions: 1 }) });
    const { result } = renderHook(() => useHarnessStatsTab({ filter: FILTER, tab: "overview" }));
    await waitFor(() => expect(result.current.tab.status).toBe("ready"));
    await waitFor(() => expect(result.current.summary.status).toBe("ready"));
    expect(result.current.sync?.phase).toBe("syncing");
    const before = stub.queries.length;

    // 补齐和结束在同一次轮询里被看到：phase 变 idle、版本 0→1。
    version = 1; phase = "idle";
    await act(async () => { await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS + 50); });
    await waitFor(() => expect(result.current.sync?.phase).toBe("idle"));
    await waitFor(() => expect(stub.queries.slice(before).map((item) => item.kind).sort()).toEqual(["options", "overview", "summary"]));
    await waitFor(() => expect(result.current.tab.status).toBe("ready"));

    const after = stub.queries.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(HARNESS_STATS_POLL_MS * 5); });
    expect(stub.queries.length).toBe(after);
  });

  it("当前 tab 查询失败时给出错误，刷新可恢复", async () => {
    install({ failKind: "tools" });
    const { result } = renderHook(() => useHarnessStatsTab({ filter: FILTER, tab: "tools" }));
    await waitFor(() => expect(result.current.tab.status).toBe("error"));
    expect(result.current.tab.error).toContain("读取失败");
    expect(result.current.summary.status).toBe("ready");
  });
});
