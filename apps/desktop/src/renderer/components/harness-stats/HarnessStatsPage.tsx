import { useCallback, useState } from "react";
import type { HarnessStatsFilter, HarnessStatsTab, HarnessStatsData } from "@actspace/shared";
import { HARNESS_STATS_TABS } from "@actspace/shared";
import { PageShell } from "../settings/SettingsPrimitives";
import { Button } from "../ui/Button";
import { UnderlineTabs, type UnderlineTab } from "../ui/UnderlineTabs";
import { ContextTab } from "./ContextTab";
import { DisclosureTab } from "./DisclosureTab";
import { DEFAULT_HARNESS_STATS_FILTER, HarnessStatsFilters } from "./HarnessStatsFilters";
import { OverviewTab } from "./OverviewTab";
import { PluginsTab } from "./PluginsTab";
import { RuntimeTab } from "./RuntimeTab";
import { ToolsTab } from "./ToolsTab";
import { VersionsTab } from "./VersionsTab";
import { DASH, fmtInt, fmtPct, fmtTokens } from "./harness-stats-format";
import { Metric, MetricGrid, Notice } from "./harness-stats-ui";
import { useHarnessStatsTab, type HarnessStatsCompare } from "./use-harness-stats";

const TAB_LABEL: Record<HarnessStatsTab, string> = {
  overview: "总览",
  plugins: "插件",
  tools: "工具",
  context: "上下文与 Skills",
  disclosure: "披露与压缩",
  runtime: "运行",
  versions: "版本对比",
};

export function isHarnessStatsTab(value: string | null | undefined): value is HarnessStatsTab {
  return HARNESS_STATS_TABS.includes(value as HarnessStatsTab);
}

type Focus = { tab: HarnessStatsTab; key?: string; nonce: number };

export function HarnessStatsPage({ initialTab = "overview" }: { initialTab?: HarnessStatsTab }) {
  const [filter, setFilter] = useState<HarnessStatsFilter>(DEFAULT_HARNESS_STATS_FILTER);
  const [tab, setTab] = useState<HarnessStatsTab>(initialTab);
  const [compare, setCompare] = useState<HarnessStatsCompare | undefined>();
  const [focus, setFocus] = useState<Focus | null>(null);
  const stats = useHarnessStatsTab({ filter, tab, compare });
  const { summary, options, sync } = stats;
  const s = summary.data;

  const openTarget = useCallback((target: { tab: HarnessStatsTab; key?: string }) => {
    setTab(target.tab);
    setFocus((current) => ({ tab: target.tab, key: target.key, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  const counts: Partial<Record<HarnessStatsTab, number | undefined>> = {
    overview: stats.tab.data?.kind === "overview" ? stats.tab.data.value.flags.length : undefined,
    plugins: s?.plugins.loaded,
    tools: s?.toolCalls.tools,
    disclosure: s?.compaction.count,
    versions: options.data?.revisions.length,
  };
  const tabs: UnderlineTab<HarnessStatsTab>[] = HARNESS_STATS_TABS.map((value) => ({ value, label: TAB_LABEL[value], count: counts[value] }));
  const focusKey = (name: HarnessStatsTab) => (focus?.tab === name ? focus.key : undefined);
  const refreshing = summary.refreshing || stats.tab.refreshing || sync?.phase === "syncing";

  return (
    <PageShell width="wide" title="Harness 统计">
      <HarnessStatsFilters filter={filter} options={options.data} onChange={setFilter} onRefresh={stats.refresh} refreshing={refreshing} />
      {sync?.phase === "syncing" ? (
        <Notice tone="info">正在补齐历史 · 已读 {fmtInt(sync.completedSessions)} / {fmtInt(sync.totalSessions)} 个会话</Notice>
      ) : null}
      {sync?.phase === "failed" ? (
        <Notice tone="error" role="alert">
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 break-words">统计同步失败：{sync.error ?? "未知错误"}</span>
            <Button size="xs" variant="secondary" onClick={stats.refresh}>重试</Button>
          </span>
        </Notice>
      ) : null}
      {sync && sync.phase !== "failed" && sync.failedSessions > 0 ? (
        <Notice tone="warn">有 {fmtInt(sync.failedSessions)} 个会话暂时无法读取，当前统计不包含这些会话。可刷新重试。</Notice>
      ) : null}
      {summary.status === "error" ? (
        <Notice tone="error" role="alert">
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 break-words">{summary.error}</span>
            <Button size="xs" variant="secondary" onClick={stats.refresh}>重试</Button>
          </span>
        </Notice>
      ) : null}

      <div className="-mt-5">
        <MetricGrid label="Harness 概览">
          <Metric label="加载的插件" value={fmtInt(s?.plugins.loaded)} detail={s ? `工具类 ${fmtInt(s.plugins.withTools)} · 自进化 ${fmtInt(s.plugins.evolved)} · 用户安装 ${fmtInt(s.plugins.user)}` : " "} />
          <Metric label="工具调用" value={fmtInt(s?.toolCalls.calls)} detail={s ? `失败率 ${fmtPct(s.toolCalls.failureRate)} · ${fmtInt(s.toolCalls.tools)} 个工具` : " "} />
          <Metric label="每次请求的上下文" value={s ? fmtTokens(s.context.avgEstimatedTokens) : DASH} detail={s ? `工具定义占 ${fmtPct(s.context.toolsShare)} · ${fmtInt(s.requests)} 次请求` : " "} />
          <Metric label="压缩" value={fmtInt(s?.compaction.count)} detail={s ? `活跃命中率 ${fmtPct(s.compaction.activeHitRate)}` : " "} />
        </MetricGrid>
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <UnderlineTabs<HarnessStatsTab> ariaLabel="Harness 统计分类" idPrefix="harness-stats" value={tab} tabs={tabs} onChange={(next) => { setTab(next); setFocus(null); }} />
        <div role="tabpanel" aria-labelledby={`harness-stats-tab-${tab}`} className="flex min-w-0 flex-col gap-3">
          {stats.tab.status === "loading" ? <Notice tone="info">正在读取{TAB_LABEL[tab]}…</Notice> : null}
          {stats.tab.status === "error" ? (
            <Notice tone="error" role="alert">
              <span className="flex items-start gap-3">
                <span className="min-w-0 flex-1 break-words">{stats.tab.error}</span>
                <Button size="xs" variant="secondary" onClick={stats.refresh}>重试</Button>
              </span>
            </Notice>
          ) : null}
          {stats.tab.status === "ready" && stats.tab.error ? <Notice tone="warn">刷新失败（{stats.tab.error}），显示的是上一次的结果。</Notice> : null}
          {stats.tab.data ? <TabBody data={stats.tab.data} focusKey={focusKey} focusNonce={focus?.nonce ?? 0} onOpenFlag={openTarget} onCompareChange={setCompare} /> : null}
          {stats.tab.status === "ready" && stats.tab.refreshing ? <p role="status" className="m-0 text-act-xs text-text-faint">正在刷新…</p> : null}
        </div>
      </section>
    </PageShell>
  );
}

function TabBody({
  data,
  focusKey,
  focusNonce,
  onOpenFlag,
  onCompareChange,
}: {
  data: HarnessStatsData;
  focusKey: (tab: HarnessStatsTab) => string | undefined;
  focusNonce: number;
  onOpenFlag: (target: { tab: HarnessStatsTab; key?: string }) => void;
  onCompareChange: (compare: HarnessStatsCompare) => void;
}) {
  switch (data.kind) {
    case "overview": return <OverviewTab data={data.value} onOpenFlag={onOpenFlag} />;
    case "plugins": return <PluginsTab key={focusNonce} data={data.value} focusKey={focusKey("plugins")} />;
    case "tools": return <ToolsTab key={focusNonce} data={data.value} focusKey={focusKey("tools")} />;
    case "context": return <ContextTab data={data.value} />;
    case "disclosure": return <DisclosureTab data={data.value} />;
    case "runtime": return <RuntimeTab data={data.value} />;
    case "versions": return <VersionsTab data={data.value} onCompareChange={onCompareChange} />;
    default: return null;
  }
}
