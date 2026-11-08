import { useCallback, useState } from "react";
import type { HarnessFlag, HarnessStatsFilter, HarnessStatsTarget } from "@actspace/shared";
import { CardGrid, useStatsJump, type TableSort } from "../stats/stats-ui";
import { fmtInt } from "../stats/stats-format";
import { PageShell } from "../settings/SettingsPrimitives";
import {
  CompactionCard,
  ContextCard,
  DisclosureCard,
  FlagsBlock,
  HarnessMetrics,
  RuntimeCard,
  SourcesCard,
  UsageVsCard,
  VersionsCard,
  type CompactionView,
  type DisclosureView,
  type MetricTarget,
  type RuntimeTab,
  type UsageTab,
} from "./HarnessStatsCards";
import { DETAIL_DEFAULT_SORT, HarnessDetail, type DetailTab } from "./HarnessStatsDetail";
import { DEFAULT_HARNESS_STATS_FILTER, HarnessStatsFilters } from "./HarnessStatsFilters";
import { ErrorNotice, Notice } from "./harness-stats-parts";
import { useHarnessStats, type HarnessStatsCompare } from "./use-harness-stats";

const USAGE_TABS = new Set<string>(["tools", "plugins", "skills"]);
const DETAIL_TABS = new Set<string>(["tools", "plugins", "sources", "skills", "compactions"]);
/** 主进程的运行时 tab 名与卡片 tab 的对应（`listeners` / `services` / `load`）。 */
const RUNTIME_TABS = new Set<string>(["services", "listeners", "load"]);

/** 「设置 → 活动 → Harness 统计」：Harness 本身好不好（front-统计页规范.md §3）。 */
export function HarnessStatsPage() {
  const [filter, setFilter] = useState<HarnessStatsFilter>(DEFAULT_HARNESS_STATS_FILTER);
  const [compare, setCompare] = useState<HarnessStatsCompare | undefined>();
  const stats = useHarnessStats({ filter, compare });
  const { flashId, jump } = useStatsJump();

  const [usageTab, setUsageTab] = useState<UsageTab>("tools");
  const [usageOpen, setUsageOpen] = useState<ReadonlySet<string>>(new Set());
  const [usageAll, setUsageAll] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [compactionView, setCompactionView] = useState<CompactionView>("summary");
  const [disclosureView, setDisclosureView] = useState<DisclosureView>("active");
  const [runtimeTab, setRuntimeTab] = useState<RuntimeTab>("services");
  const [detailTab, setDetailTab] = useState<DetailTab>("tools");
  const [detailSort, setDetailSort] = useState<TableSort>(DETAIL_DEFAULT_SORT.tools);

  const changeUsageTab = useCallback((tab: UsageTab) => { setUsageTab(tab); setUsageOpen(new Set()); setUsageAll(false); }, []);
  const toggleUsageRow = useCallback((key: string) => setUsageOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const changeDetailTab = useCallback((tab: DetailTab) => { setDetailTab(tab); setDetailSort(DETAIL_DEFAULT_SORT[tab]); }, []);
  const openDetail = useCallback((tab: DetailTab, sort: TableSort) => { setDetailTab(tab); setDetailSort(sort); jump("detail"); }, [jump]);

  /** 值得关注点击：按目标切 tab / 排序 / 选中类别，再滚过去高亮。 */
  const openTarget = useCallback((target: HarnessStatsTarget) => {
    switch (target.card) {
      case "usage-vs":
        if (target.tab && USAGE_TABS.has(target.tab)) changeUsageTab(target.tab as UsageTab);
        setUsageOpen(target.key ? new Set([target.key]) : new Set());
        return jump("usage-vs");
      case "sources":
        setCategory(target.tab ?? null);
        return jump("sources");
      case "compaction":
        setCompactionView("summary");
        return jump("compaction");
      case "disclosure":
        if (target.tab === "sleep" || target.tab === "active" || target.tab === "paths") setDisclosureView(target.tab);
        return jump("disclosure");
      case "runtime":
        if (target.tab && RUNTIME_TABS.has(target.tab)) setRuntimeTab(target.tab as RuntimeTab);
        return jump("runtime");
      case "detail": {
        const tab = target.tab && DETAIL_TABS.has(target.tab) ? (target.tab as DetailTab) : "tools";
        return openDetail(tab, tab === "tools" ? { key: "failureRate", dir: "desc" } : DETAIL_DEFAULT_SORT[tab]);
      }
    }
  }, [changeUsageTab, jump, openDetail]);

  const openMetric = useCallback((target: MetricTarget) => {
    switch (target) {
      case "overhead": return jump("ctx");
      case "cache": return jump("sources");
      case "failure": return openDetail("tools", { key: "failureRate", dir: "desc" });
      case "waste": return openDetail("tools", { key: "repeated", dir: "desc" });
      case "reread": setCompactionView("summary"); return jump("compaction");
    }
  }, [jump, openDetail]);

  const { sync, overview, usageVs, context, disclosure, plugins, versions } = stats;
  const refreshing = stats.refreshing || sync?.phase === "syncing";
  const revisions = stats.options.data?.revisions;
  const flash = (id: string) => flashId === id;

  return (
    <PageShell width="wide" title="Harness 统计">
      <div className="-mt-5 flex min-w-0 flex-col gap-3">
        <p className="m-0 text-act-sm text-text-muted">Harness 本身好不好用：每次请求先付多少固定开销、哪些工具白占上下文、工具好不好用、压缩和披露有没有用、改版之后变好还是变坏。</p>
        <HarnessStatsFilters filter={filter} options={stats.options.data} onChange={setFilter} onRefresh={stats.refresh} refreshing={refreshing} />
        {sync?.phase === "syncing" ? <Notice tone="info">正在补齐历史 · 已读 {fmtInt(sync.completedSessions)} / {fmtInt(sync.totalSessions)} 个会话</Notice> : null}
        {sync?.phase === "failed" ? <ErrorNotice message={`统计同步失败：${sync.error ?? "未知错误"}`} onRetry={stats.refresh} /> : null}
        {sync && sync.phase !== "failed" && sync.failedSessions > 0 ? <Notice tone="warn">有 {fmtInt(sync.failedSessions)} 个会话暂时无法读取，当前统计不包含这些会话。可刷新重试。</Notice> : null}
        {overview.status === "error" ? <ErrorNotice message={overview.error ?? "读取失败"} onRetry={stats.refresh} /> : null}

        <FlagsBlock flags={overview.data?.flags ?? []} onOpen={(flag: HarnessFlag) => openTarget(flag.target)} />
        <HarnessMetrics overview={overview.data} revisions={revisions} onOpen={openMetric} />

        <CardGrid>
          <UsageVsCard data={usageVs.data} error={usageVs.error} onRetry={stats.refresh} range={filter.range} tab={usageTab} onTabChange={changeUsageTab}
            open={usageOpen} onToggle={toggleUsageRow} all={usageAll} onToggleAll={() => setUsageAll((value) => !value)} flash={flash("usage-vs")} />
          <ContextCard data={context.data} error={context.error} onRetry={stats.refresh} selected={category} onSelect={setCategory} flash={flash("ctx")} />
          <SourcesCard data={context.data} error={context.error} onRetry={stats.refresh} selected={category} onClear={() => setCategory(null)} flash={flash("sources")} />
          <CompactionCard data={disclosure.data} error={disclosure.error} onRetry={stats.refresh} view={compactionView} onViewChange={setCompactionView} flash={flash("compaction")} />
          <DisclosureCard data={disclosure.data} error={disclosure.error} onRetry={stats.refresh} view={disclosureView} onViewChange={setDisclosureView} flash={flash("disclosure")} />
          <RuntimeCard data={plugins.data} error={plugins.error} onRetry={stats.refresh} tab={runtimeTab} onTabChange={setRuntimeTab} flash={flash("runtime")} />
          <VersionsCard data={versions.data} error={versions.error} onRetry={stats.refresh} onCompareChange={setCompare} flash={flash("versions")} />
        </CardGrid>

        <HarnessDetail stats={stats} tab={detailTab} onTabChange={changeDetailTab} sort={detailSort} onSortChange={setDetailSort} flash={flash("detail")} />
        {stats.refreshing ? <p role="status" className="m-0 text-act-xs text-text-faint">正在刷新…</p> : null}
      </div>
    </PageShell>
  );
}
