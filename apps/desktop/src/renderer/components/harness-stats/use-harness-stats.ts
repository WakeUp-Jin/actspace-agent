import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  HarnessRevisionKey,
  HarnessStatsContext,
  HarnessStatsData,
  HarnessStatsDisclosure,
  HarnessStatsFilter,
  HarnessStatsOptions,
  HarnessStatsOverview,
  HarnessStatsPlugins,
  HarnessStatsQueryKind,
  HarnessStatsQueryResult,
  HarnessStatsSyncStatus,
  HarnessStatsUsageVs,
  HarnessStatsVersions,
} from "@actspace/shared";
import { HARNESS_STATS_QUERY_KINDS } from "@actspace/shared";
import { harnessStatsApi } from "../../api/harness-stats";
import { liveEvents } from "../../api/live-events";

/** 会话日志有新事件后等多久再刷新。 */
export const HARNESS_STATS_JOURNAL_DEBOUNCE_MS = 2000;
/** 正在补历史数据时轮询同步进度的间隔。 */
export const HARNESS_STATS_POLL_MS = 1000;
/** 同一种数据拿到的 dataVersion 比已知的旧时，最多连续再查几次（防止主进程提交与查询错位时死循环）。 */
const MAX_STALE_RETRIES = 2;

/** 选项（模式、模型、版本）与筛选无关，永远查「全部」。 */
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

type ValueMap = { [D in HarnessStatsData as D["kind"]]: D["value"] };
type ValueOf<K extends HarnessStatsQueryKind> = ValueMap[K];

type Entry = { key: string; result: HarnessStatsQueryResult | null; error: string | null; loading: boolean };
type Inflight = { requestId: string; key: string };

export type HarnessStatsController = {
  readonly options: StatsView<HarnessStatsOptions>;
  readonly overview: StatsView<HarnessStatsOverview>;
  readonly usageVs: StatsView<HarnessStatsUsageVs>;
  readonly context: StatsView<HarnessStatsContext>;
  readonly disclosure: StatsView<HarnessStatsDisclosure>;
  readonly plugins: StatsView<HarnessStatsPlugins>;
  readonly versions: StatsView<HarnessStatsVersions>;
  readonly sync: HarnessStatsSyncStatus | null;
  /** 任何一块正在后台刷新。 */
  readonly refreshing: boolean;
  /** 手动刷新：7 块全部重新查询。 */
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

function keyOf(kind: HarnessStatsQueryKind, filterKey: string, compareKey: string): string {
  if (kind === "options") return "options";
  return kind === "versions" ? `${filterKey}|${compareKey}` : filterKey;
}

/**
 * 「Harness 统计」页的数据来源：打开页面时 7 块（options / overview / usage-vs / context / disclosure / plugins / versions）并行查询。
 *
 * 缓存：每块保留一份结果，键 = kind + 筛选（versions 还包括对比的两个版本）；结果带 dataVersion，
 * 比已知的最新 dataVersion 旧就当过期、重新查。
 * 刷新：会话日志更新（流式文本增量除外）后 2 秒防抖，全部重查；
 * 同步在补历史（`phase === "syncing"`）时每秒轮询 getStatus，dataVersion 变了就把过期的块重查。
 */
export function useHarnessStats({
  filter,
  compare,
}: {
  filter: HarnessStatsFilter;
  compare?: HarnessStatsCompare;
}): HarnessStatsController {
  const filterKey = JSON.stringify(filter);
  const compareKey = compare ? `${compare.from}>${compare.to}` : "";
  const filterRef = useRef(filter);
  const compareRef = useRef(compare);
  filterRef.current = filter;
  compareRef.current = compare;

  const entriesRef = useRef<Partial<Record<HarnessStatsQueryKind, Entry>>>({});
  const inflightRef = useRef<Partial<Record<HarnessStatsQueryKind, Inflight>>>({});
  /** 已知的最新 dataVersion；null = 还没收到任何版本。0 是合法版本（空库首次同步前），不能当「未知」。 */
  const latestVersionRef = useRef<number | null>(null);
  const staleRetriesRef = useRef<Partial<Record<HarnessStatsQueryKind, number>>>({});
  const [entries, setEntries] = useState<Partial<Record<HarnessStatsQueryKind, Entry>>>({});
  const [sync, setSync] = useState<HarnessStatsSyncStatus | null>(null);

  const commit = useCallback((kind: HarnessStatsQueryKind, entry: Entry | null) => {
    const next = { ...entriesRef.current };
    if (entry) next[kind] = entry;
    else delete next[kind];
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const keyFor = useCallback((kind: HarnessStatsQueryKind): string => {
    const c = compareRef.current;
    return keyOf(kind, JSON.stringify(filterRef.current), c ? `${c.from}>${c.to}` : "");
  }, []);

  const abandon = useCallback((kind: HarnessStatsQueryKind) => {
    const inflight = inflightRef.current[kind];
    if (!inflight) return;
    delete inflightRef.current[kind];
    // 取消只是让主进程少做一点事；失败（请求已经结束）不影响页面，结果本来就会被丢弃，所以只吞掉。
    void harnessStatsApi.cancel({ requestId: inflight.requestId }).catch(() => undefined);
  }, []);

  const ensureRef = useRef<(kind: HarnessStatsQueryKind, force?: boolean) => void>(() => undefined);

  const noteVersion = useCallback((version: number) => {
    const known = latestVersionRef.current;
    if (known !== null && version <= known) return;
    latestVersionRef.current = version;
    staleRetriesRef.current = {};
    // 第一份结果只是「知道版本号」，正在飞的其他请求不算过期；之后任何变大（包括 0→1）都要把过期的块重查。
    if (known !== null) for (const kind of HARNESS_STATS_QUERY_KINDS) ensureRef.current(kind);
  }, []);

  const ensure = useCallback(
    (kind: HarnessStatsQueryKind, force = false) => {
      const key = keyFor(kind);
      const current = entriesRef.current[kind];
      const fresh =
        current?.key === key &&
        current.result &&
        !current.error &&
        current.result.dataVersion >= (latestVersionRef.current ?? 0);
      if (fresh && !force) return;
      const inflight = inflightRef.current[kind];
      if (inflight && inflight.key === key && !force) return;
      abandon(kind);
      const requestId = nextRequestId();
      inflightRef.current[kind] = { requestId, key };
      const previous = current?.key === key ? current.result : null;
      commit(kind, { key, result: previous, error: null, loading: true });
      const superseded = () => inflightRef.current[kind]?.requestId !== requestId;
      const queryFilter = kind === "options" ? OPTIONS_FILTER : filterRef.current;
      const queryCompare = kind === "versions" ? compareRef.current : undefined;
      harnessStatsApi
        .query({ requestId, kind, filter: queryFilter, ...(queryCompare ? { compare: queryCompare } : {}) })
        .then(
          (result) => {
            if (superseded()) return;
            delete inflightRef.current[kind];
            if (!result || result.data.kind !== kind) {
              commit(kind, { key, result: previous, error: QUERY_FAILED, loading: false });
              return;
            }
            commit(kind, { key, result, error: null, loading: false });
            setSync(result.sync);
            const behind = latestVersionRef.current !== null && result.dataVersion < latestVersionRef.current;
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
            commit(kind, { key, result: previous, error: errorMessage(error), loading: false });
          },
        );
    },
    [abandon, commit, keyFor, noteVersion],
  );
  ensureRef.current = ensure;

  // 首屏与筛选 / 对比变化：键变了的块丢掉缓存，7 块并行查（键没变且新鲜的跳过）。
  useEffect(() => {
    for (const kind of Object.keys(entriesRef.current) as HarnessStatsQueryKind[]) {
      const entry = entriesRef.current[kind];
      if (entry && entry.key !== keyFor(kind)) {
        abandon(kind);
        commit(kind, null);
      }
    }
    for (const kind of HARNESS_STATS_QUERY_KINDS) ensure(kind);
  }, [filterKey, compareKey, ensure, abandon, commit, keyFor]);

  // 离开页面：取消还在飞的请求。
  useEffect(
    () => () => {
      for (const kind of Object.keys(inflightRef.current) as HarnessStatsQueryKind[]) abandon(kind);
    },
    [abandon],
  );

  // 会话日志更新：流式文本增量（assistant-delta 等）不算，只看 journal-update；2 秒防抖后除选项外全部重查。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = liveEvents.subscribe((envelope) => {
      if (envelope.event.kind !== "journal-update") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        for (const kind of HARNESS_STATS_QUERY_KINDS) if (kind !== "options") ensureRef.current(kind, true);
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
    staleRetriesRef.current = {};
    for (const kind of HARNESS_STATS_QUERY_KINDS) ensureRef.current(kind, true);
  }, []);

  return useMemo(() => {
    const view = <K extends HarnessStatsQueryKind>(kind: K): StatsView<ValueOf<K>> => {
      const entry = entries[kind];
      if (!entry || entry.key !== keyOf(kind, filterKey, compareKey))
        return { status: "loading", data: null, error: null, refreshing: false };
      const data = entry.result?.data.kind === kind ? (entry.result.data.value as ValueOf<K>) : null;
      if (entry.error && !data) return { status: "error", data: null, error: entry.error, refreshing: false };
      if (!data) return { status: "loading", data: null, error: null, refreshing: false };
      return { status: "ready", data, error: entry.error, refreshing: entry.loading };
    };
    const views = {
      options: view("options"),
      overview: view("overview"),
      usageVs: view("usage-vs"),
      context: view("context"),
      disclosure: view("disclosure"),
      plugins: view("plugins"),
      versions: view("versions"),
    };
    return { ...views, sync, refreshing: Object.values(views).some((item) => item.refreshing), refresh };
  }, [entries, filterKey, compareKey, sync, refresh]);
}
