import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  HarnessRevisionKey,
  HarnessStatsData,
  HarnessStatsFilter,
  HarnessStatsOptions,
  HarnessStatsQueryKind,
  HarnessStatsQueryResult,
  HarnessStatsSummary,
  HarnessStatsSyncStatus,
  HarnessStatsTab,
} from "@actspace/shared";
import { harnessStatsApi } from "../../api/harness-stats";
import { liveEvents } from "../../api/live-events";

/** 会话日志有新事件后等多久再刷新当前 tab。 */
export const HARNESS_STATS_JOURNAL_DEBOUNCE_MS = 2000;
/** 正在补历史数据时轮询同步进度的间隔。 */
export const HARNESS_STATS_POLL_MS = 1000;
/** 同一种数据拿到的 dataVersion 比已知的旧时，最多连续再查几次（防止主进程提交与查询错位时死循环）。 */
const MAX_STALE_RETRIES = 2;

/** 选项（模式、模型、工作区、版本）与筛选无关，永远查「全部」。 */
const OPTIONS_FILTER: HarnessStatsFilter = { range: "total", sessionKind: "all" };
const QUERY_FAILED = "没有取到统计结果，请重试。";

export type HarnessStatsCompare = { readonly from: HarnessRevisionKey; readonly to: HarnessRevisionKey };

export type StatsView<T> = {
  readonly status: "loading" | "ready" | "error";
  readonly data: T | null;
  readonly error: string | null;
  /** 已经有数据，正在后台刷新（刷新、会话日志更新、dataVersion 变化）。 */
  readonly refreshing: boolean;
};

type Entry = { key: string; result: HarnessStatsQueryResult | null; error: string | null; loading: boolean };
type Inflight = { requestId: string; key: string };

export type HarnessStatsController = {
  readonly summary: StatsView<HarnessStatsSummary>;
  readonly options: StatsView<HarnessStatsOptions>;
  readonly tab: StatsView<HarnessStatsData>;
  readonly sync: HarnessStatsSyncStatus | null;
  /** 手动刷新：当前 tab、指标卡和选项重新查询，其他 tab 的缓存作废。 */
  readonly refresh: () => void;
};

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `hs-${Date.now().toString(36)}-${requestCounter}`;
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Electron 的 invoke 错误带「Error invoking remote method …」前缀，用户看不懂。
  return text.startsWith("Error invoking remote method") ? "Harness 统计读取失败，请重试。" : text;
}

/**
 * 「Harness 统计」页的数据来源。首屏只查 summary、options 和当前 tab，切 tab 才查对应的 tab。
 *
 * 缓存：每种数据（kind）保留一份结果，键 = 筛选（versions 还包括对比的两个版本）；结果带 dataVersion，
 * 比已知的最新 dataVersion 旧就当过期、重新查。改筛选时其他 tab 的缓存直接丢弃。
 * 刷新：会话日志更新（流式文本增量除外）后 2 秒防抖，只刷新当前 tab 和指标卡；
 * 同步在补历史（`phase === "syncing"`）时每秒轮询 getStatus，dataVersion 变了就刷新当前 tab。
 */
export function useHarnessStatsTab({
  filter,
  tab,
  compare,
}: {
  filter: HarnessStatsFilter;
  tab: HarnessStatsTab;
  compare?: HarnessStatsCompare;
}): HarnessStatsController {
  const filterKey = JSON.stringify(filter);
  const compareKey = compare ? `${compare.from}>${compare.to}` : "";
  const filterRef = useRef(filter);
  const compareRef = useRef(compare);
  const tabRef = useRef(tab);
  filterRef.current = filter;
  compareRef.current = compare;
  tabRef.current = tab;

  const entriesRef = useRef<Partial<Record<HarnessStatsQueryKind, Entry>>>({});
  const inflightRef = useRef<Partial<Record<HarnessStatsQueryKind, Inflight>>>({});
  const latestVersionRef = useRef(0);
  const staleRetriesRef = useRef<Partial<Record<HarnessStatsQueryKind, number>>>({});
  const [entries, setEntries] = useState<Partial<Record<HarnessStatsQueryKind, Entry>>>({});
  const [sync, setSync] = useState<HarnessStatsSyncStatus | null>(null);

  const commit = useCallback((kind: HarnessStatsQueryKind, entry: Entry | null) => {
    const next = { ...entriesRef.current };
    if (entry) next[kind] = entry; else delete next[kind];
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const keyFor = useCallback((kind: HarnessStatsQueryKind): string => {
    if (kind === "options") return "options";
    return kind === "versions" ? `${JSON.stringify(filterRef.current)}|${compareRef.current ? `${compareRef.current.from}>${compareRef.current.to}` : ""}` : JSON.stringify(filterRef.current);
  }, []);

  const abandon = useCallback((kind: HarnessStatsQueryKind) => {
    const inflight = inflightRef.current[kind];
    if (!inflight) return;
    delete inflightRef.current[kind];
    // 取消只是让主进程少做一点事；失败（请求已经结束）不影响页面，结果本来就会被丢弃，所以只吞掉。
    void harnessStatsApi.cancel({ requestId: inflight.requestId }).catch(() => undefined);
  }, []);

  const ensureRef = useRef<(kind: HarnessStatsQueryKind, force?: boolean) => void>(() => undefined);

  /** 已知有更新的 dataVersion：把当前页面用到的、结果已经过期的数据重新查一遍。 */
  const revalidateActive = useCallback(() => {
    for (const kind of ["summary", "options", tabRef.current] as const) ensureRef.current(kind);
  }, []);

  const noteVersion = useCallback((version: number) => {
    if (version <= latestVersionRef.current) return;
    const first = latestVersionRef.current === 0;
    latestVersionRef.current = version;
    staleRetriesRef.current = {};
    // 第一份结果只是「知道版本号」，正在飞的其他请求不算过期。
    if (!first) revalidateActive();
  }, [revalidateActive]);

  const ensure = useCallback((kind: HarnessStatsQueryKind, force = false) => {
    const key = keyFor(kind);
    const current = entriesRef.current[kind];
    const fresh = current?.key === key && current.result && !current.error && current.result.dataVersion >= latestVersionRef.current;
    if (fresh && !force) return;
    const inflight = inflightRef.current[kind];
    if (inflight && inflight.key === key && !force) return;
    abandon(kind);
    const requestId = nextRequestId();
    inflightRef.current[kind] = { requestId, key };
    commit(kind, { key, result: current?.key === key ? current.result : null, error: null, loading: true });
    const superseded = () => inflightRef.current[kind]?.requestId !== requestId;
    const queryFilter = kind === "options" ? OPTIONS_FILTER : filterRef.current;
    const queryCompare = kind === "versions" ? compareRef.current : undefined;
    harnessStatsApi.query({ requestId, kind, filter: queryFilter, ...(queryCompare ? { compare: queryCompare } : {}) }).then(
      (result) => {
        if (superseded()) return;
        delete inflightRef.current[kind];
        if (!result || result.data.kind !== kind) {
          commit(kind, { key, result: current?.key === key ? current.result : null, error: QUERY_FAILED, loading: false });
          return;
        }
        commit(kind, { key, result, error: null, loading: false });
        setSync(result.sync);
        const behind = result.dataVersion < latestVersionRef.current;
        noteVersion(result.dataVersion);
        if (behind) {
          const retries = staleRetriesRef.current[kind] ?? 0;
          if (retries < MAX_STALE_RETRIES) {
            staleRetriesRef.current[kind] = retries + 1;
            ensureRef.current(kind);
          }
        }
      },
      (error: unknown) => {
        if (superseded()) return;
        delete inflightRef.current[kind];
        commit(kind, { key, result: current?.key === key ? current.result : null, error: errorMessage(error), loading: false });
      },
    );
  }, [abandon, commit, keyFor, noteVersion]);
  ensureRef.current = ensure;

  // 首屏与切换：筛选 / 对比变了先丢掉对应缓存，再查指标卡和当前 tab；选项只查一次。
  useEffect(() => {
    for (const kind of Object.keys(entriesRef.current) as HarnessStatsQueryKind[]) {
      const entry = entriesRef.current[kind];
      if (entry && entry.key !== keyFor(kind)) {
        abandon(kind);
        commit(kind, null);
      }
    }
    ensure("options");
    ensure("summary");
    ensure(tab);
  }, [filterKey, compareKey, tab, ensure, abandon, commit, keyFor]);

  // 离开页面：取消还在飞的请求。
  useEffect(() => () => {
    for (const kind of Object.keys(inflightRef.current) as HarnessStatsQueryKind[]) abandon(kind);
  }, [abandon]);

  // 会话日志更新：流式文本增量（assistant-delta 等）不算，只看 journal-update；2 秒防抖。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = liveEvents.subscribe((envelope) => {
      if (envelope.event.kind !== "journal-update") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        ensureRef.current(tabRef.current, true);
        ensureRef.current("summary", true);
      }, HARNESS_STATS_JOURNAL_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 正在补历史：轮询同步进度，dataVersion 变了就刷新。
  const syncing = sync?.phase === "syncing";
  useEffect(() => {
    if (!syncing) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void harnessStatsApi.getStatus().then(
        (status) => {
          if (cancelled || !status) return;
          setSync(status);
          noteVersion(status.dataVersion);
        },
        // 轮询失败不打断页面：下一秒还会再试，进度条只是暂时不动。
        () => undefined,
      );
    }, HARNESS_STATS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [syncing, noteVersion]);

  const refresh = useCallback(() => {
    const active = new Set<HarnessStatsQueryKind>(["summary", "options", tabRef.current]);
    for (const kind of Object.keys(entriesRef.current) as HarnessStatsQueryKind[]) {
      if (!active.has(kind)) {
        abandon(kind);
        commit(kind, null);
      }
    }
    staleRetriesRef.current = {};
    for (const kind of active) ensureRef.current(kind, true);
  }, [abandon, commit]);

  const view = useCallback(<T,>(kind: HarnessStatsQueryKind, pick: (data: HarnessStatsData) => T): StatsView<T> => {
    const entry = entries[kind];
    const matches = entry && entry.key === (kind === "options" ? "options" : kind === "versions" ? `${filterKey}|${compareKey}` : filterKey);
    if (!entry || !matches) return { status: "loading", data: null, error: null, refreshing: false };
    const data = entry.result ? pick(entry.result.data) : null;
    if (entry.error && !data) return { status: "error", data: null, error: entry.error, refreshing: false };
    if (!data) return { status: "loading", data: null, error: null, refreshing: false };
    return { status: "ready", data, error: entry.error, refreshing: entry.loading };
  }, [entries, filterKey, compareKey]);

  return useMemo(() => ({
    summary: view("summary", (data) => (data as Extract<HarnessStatsData, { kind: "summary" }>).value),
    options: view("options", (data) => (data as Extract<HarnessStatsData, { kind: "options" }>).value),
    tab: view<HarnessStatsData>(tab, (data) => data),
    sync,
    refresh,
  }), [view, tab, sync, refresh]);
}
