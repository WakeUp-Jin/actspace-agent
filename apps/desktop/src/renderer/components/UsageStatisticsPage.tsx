import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bot, ChartColumn, Clock, Code, Database, Gauge, RefreshCw, Terminal } from "lucide-react";
import type {
  SettingsV4NamespacePatch,
  SettingsV4Snapshot,
  SettingsV4UsagePreferences,
  UsageActivityAggregate,
  UsageActivityRow,
  UsageActivitySnapshot,
  UsageCommandRow,
  UsageQueryProgress,
  UsageSkillRow,
  UsageStatisticsRange,
  UsageToolRow,
  WorkspaceEntry,
} from "@actspace/shared";
import { PageShell, SegmentedControl, SettingsSelect } from "./settings/SettingsPrimitives";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { UnderlineTabs } from "./ui/UnderlineTabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";
import {
  BarChart, CardGrid, DataTable, DetailSection, Donut, Heatmap, HoverValue, MetricCard, MetricRow, Pager, Pill, RankList, SmallTabs, StatsCard, StatsScroll, SubHeading,
  type RankRow, type TableColumn, type TableSort, useStatsJump,
} from "./stats/stats-ui";
import { DASH, average, fmtDateTime, fmtDuration, fmtInt, fmtPct, fmtRelativeDay, fmtTokens, fmtUsd, ratio } from "./stats/stats-format";
import type { UsageQuery } from "./usage/usage-query";
import {
  PURPOSE_LABEL, SUBCOMMAND_PROGRAMS, cacheHitRate, costDetail, fmtCacheHit, failureLabel, fmtTrend, gapNote, modelCostDetail, modelSpeed, modelTokenDetail, modelsWithLabels,
  phaseSegments, priceDetail, rangeDays, timeDetail, tokenDetail, tokenModelSegments, tokenTypeSegments, toolTimeSegments, trendModel,
} from "./usage/usage-stats-model";

/* 使用统计（front-统计页规范.md §2）：用了多少。数据来自 usage.getActivity，筛选不持久化，tab / 视图存 activity.usage。 */

type Prefs = SettingsV4UsagePreferences;
type DetailTab = Prefs["activeTab"];
type Props = {
  activitySnapshot?: UsageActivitySnapshot | null;
  isLoading?: boolean;
  progress?: UsageQueryProgress | null;
  onCancel?: () => void;
  error?: string | null;
  onQuery?: (query: UsageQuery) => void;
  workspaces?: WorkspaceEntry[];
  settingsV4?: SettingsV4Snapshot | null;
  onUpdateNamespace?: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
};

const RANGE_OPTIONS: { value: UsageStatisticsRange; label: string }[] = [{ value: "day", label: "24 小时" }, { value: "week", label: "7 天" }, { value: "month", label: "30 天" }, { value: "total", label: "全部" }];
const RANGE_TO_PREF: Record<UsageStatisticsRange, Prefs["range"]> = { day: "24h", week: "7d", month: "30d", total: "all" };
const PREF_TO_RANGE: Record<Prefs["range"], UsageStatisticsRange> = { "24h": "day", "7d": "week", "30d": "month", all: "total" };
const DEFAULT_PREFS: Prefs = { range: "30d", activeTab: "requests", tokenView: "type", timeView: "phase", trendMetric: "tokens", heatMetric: "sessions" };
const ALL = "__all";
const PROGRESS_LABEL: Record<UsageQueryProgress["phase"], string> = { queued: "等待查询", checking: "检查使用记录", syncing: "正在同步使用记录", rebuilding: "正在重建统计索引", querying: "正在查询", fallback: "正在从会话记录读取", cancelled: "正在取消" };
const STATUS_PILL: Record<UsageActivityRow["status"], { tone: "ok" | "err" | "warn" | "info" | "neutral"; label: string }> = {
  success: { tone: "ok", label: "成功" }, error: { tone: "err", label: "失败" }, aborted: { tone: "warn", label: "已中止" }, running: { tone: "info", label: "进行中" }, unknown: { tone: "neutral", label: "未知" },
};

const DETAIL_TABS: readonly DetailTab[] = ["requests", "models", "providers", "tools", "commands", "skills"];
/** 主进程已清洗过；这里再兜一次旧值（如 `pricing`），避免 tab 落空。 */
function normalizePrefs(saved: Prefs | undefined): Prefs {
  const merged = { ...DEFAULT_PREFS, ...saved };
  return DETAIL_TABS.includes(merged.activeTab) ? merged : { ...merged, activeTab: "requests" };
}

export function UsageStatisticsPage({ activitySnapshot: data = null, isLoading, progress, onCancel, error, onQuery, workspaces = [], settingsV4, onUpdateNamespace }: Props) {
  const saved = settingsV4?.settings.activity.usage;
  const [prefs, setPrefs] = useState<Prefs>(() => normalizePrefs(saved));
  const [model, setModel] = useState("");
  const [providerId, setProviderId] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [modelSort, setModelSort] = useState<TableSort>({ key: "tokens", dir: "desc" });
  const [toolSort, setToolSort] = useState<TableSort>({ key: "calls", dir: "desc" });
  const { flashId, jump } = useStatsJump();
  const range = PREF_TO_RANGE[prefs.range];
  const update = (patch: Partial<Prefs>) => setPrefs((current) => ({ ...current, ...patch }));

  // 筛选或范围变化就从第一页重新查；首次挂载也走这里。
  const filters = useMemo(() => ({ range, ...(model ? { model } : {}), ...(providerId ? { providerId } : {}), ...(workspaceRoot ? { workspaceRoot } : {}) }), [range, model, providerId, workspaceRoot]);
  const onQueryRef = useRef(onQuery);
  onQueryRef.current = onQuery;
  useEffect(() => { onQueryRef.current?.({ ...filters, page: 1 }); }, [filters]);
  const query = (page: number) => onQuery?.({ ...filters, page });

  // 设置晚于页面到达时先用已存值，不能拿默认值去覆盖。
  const hydrated = useRef(Boolean(saved));
  useEffect(() => {
    if (hydrated.current || !saved) return;
    hydrated.current = true;
    setPrefs(normalizePrefs(saved));
  }, [saved]);

  // 偏好防抖写回；和已存值相同就不写。
  useEffect(() => {
    if (!saved || !onUpdateNamespace || !hydrated.current) return;
    if ((Object.keys(prefs) as (keyof Prefs)[]).every((key) => saved[key] === prefs[key])) return;
    const timer = setTimeout(() => { void onUpdateNamespace({ namespace: "activity", patch: { usage: prefs } }).catch(() => undefined); }, 300);
    return () => clearTimeout(timer);
  }, [prefs, saved, onUpdateNamespace]);

  const errorSummary = error?.startsWith("Error invoking remote method ") ? "使用统计读取失败，请重试。" : error;
  const modelFiltered = Boolean(model || providerId);
  const anyFilter = modelFiltered || Boolean(workspaceRoot);
  const harnessNote = modelFiltered ? "不受模型、提供商筛选影响" : undefined;

  const options = data?.filterOptions;
  const workspaceLabel = (path: string) => workspaces.find((entry) => entry.path === path)?.label ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const select = (label: string, value: string, values: readonly string[], allLabel: string, onChange: (value: string) => void, format: (value: string) => string = (value) => value) => (
    <SettingsSelect size="sm" ariaLabel={label} value={value || ALL} onChange={(next) => onChange(next === ALL ? "" : next)}
      options={[{ value: ALL, label: allLabel }, ...[...new Set([...values, ...(value ? [value] : [])])].map((item) => ({ value: item, label: format(item) }))]} />
  );

  const summary = data?.summary;
  const cost = data?.costSummary;
  const costKnown = Boolean(cost && cost.knownCostRequestCount > 0);
  const days = rangeDays(range, data?.series?.firstAt);
  const perRequest = costKnown ? fmtUsd(average(cost!.costUsd, cost!.knownCostRequestCount), true) : DASH;
  const costDetailText = !summary || summary.requestCount === 0 ? undefined
    : range === "day" ? `每次请求 ${perRequest}`
      : `日均 ${costKnown && days ? fmtUsd(cost!.costUsd / days) : DASH} · 每次请求 ${perRequest}`;
  const toolCalls = data?.tools?.reduce((sum, tool) => sum + tool.calls, 0);
  const bashCalls = data?.commands?.reduce((sum, command) => sum + command.calls, 0);
  const gap = gapNote(data);
  // 每次请求都没有用量时写「—」；显式的 0 照常显示。
  const tokensAllUnknown = Boolean(summary && summary.requestCount > 0 && summary.unknownTokenRequestCounts.total >= summary.requestCount);
  const loadingFirst = Boolean(isLoading && !data);
  const timeUntimed = data?.timing?.untimedRequests ?? 0;

  const tokenSegments = summary ? (prefs.tokenView === "type" ? tokenTypeSegments(summary) : tokenModelSegments(data?.aggregates?.models ?? [])) : [];
  const timeSegments = data ? (prefs.timeView === "phase" ? phaseSegments(data) : toolTimeSegments(data)) : [];
  const timeTotal = timeSegments.reduce((sum, segment) => sum + segment.value, 0);
  const trend = data?.series ? trendModel(data.series, prefs.trendMetric) : null;
  const heatValues = useMemo(() => new Map((data?.heatmap?.days ?? []).map((day) => [day.date, prefs.heatMetric === "sessions" ? day.sessions : day.tokens])), [data?.heatmap, prefs.heatMetric]);

  const openDetail = (tab: DetailTab, sort?: () => void) => { update({ activeTab: tab }); sort?.(); jump("detail"); };

  return (
    <div className="min-w-0 text-text-main">
      <PageShell width="wide" title="使用统计">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="统计筛选">
            <SegmentedControl size="sm" ariaLabel="统计时间范围" value={range} options={RANGE_OPTIONS} onChange={(value) => update({ range: RANGE_TO_PREF[value] })} />
            {select("筛选模型", model, options?.models ?? [], "全部模型", setModel)}
            {select("筛选提供商", providerId, options?.providers ?? [], "全部提供商", setProviderId)}
            {select("筛选工作区", workspaceRoot, options?.workspaces ?? [], "全部工作区", setWorkspaceRoot, workspaceLabel)}
            <IconButton label="刷新使用统计" variant="ghost" className="ml-auto" disabled={isLoading} onClick={() => query(data?.rowsPage.page ?? 1)}>
              <RefreshCw size={15} aria-hidden="true" className={isLoading ? "animate-spin motion-reduce:animate-none" : undefined} />
            </IconButton>
          </div>

          {isLoading && progress ? (
            <div className="flex items-center justify-between gap-3 text-act-xs text-text-muted" role="status">
              <span>{PROGRESS_LABEL[progress.phase]} · {progress.completedSessions}/{progress.totalSessions} 个会话 · 已读取 {fmtInt(progress.eventsRead)} 条记录</span>
              <Button size="sm" variant="ghost" onClick={onCancel} disabled={progress.phase === "cancelled"}>取消查询</Button>
            </div>
          ) : null}
          {data?.readModel?.failedSources ? <p role="status" className="text-act-sm text-warning">有 {fmtInt(data.readModel.failedSources)} 个会话暂时无法读取，当前统计不包含这些会话。可刷新重试。</p> : null}
          {data?.readModel?.status === "fallback" ? <p role="status" className="text-act-sm text-warning">统计索引暂不可用，当前结果从会话记录读取。可刷新重试。</p> : null}
          {data?.harnessUnavailable ? <p role="status" className="text-act-sm text-warning">工具、命令、Skills 与子 Agent 统计暂不可用，刷新后重试。</p> : null}
          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-act-md bg-danger-soft px-3 py-2 text-act-xs text-on-danger">
              <div className="min-w-0 flex-1">
                <p className="m-0 whitespace-pre-wrap break-all">{errorSummary}</p>
                {error !== errorSummary ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-focus-ring">错误详情</summary>
                    <p className="m-0 mt-1 whitespace-pre-wrap break-all">{error}</p>
                  </details>
                ) : null}
              </div>
              <Button size="xs" variant="ghost" className="shrink-0" onClick={() => query(1)}>重试</Button>
            </div>
          ) : null}

          {loadingFirst ? <div role="status" className="rounded-act-md bg-surface-subtle p-5 text-act-sm text-text-faint">正在读取使用记录…</div> : (
            <>
              <MetricRow label="使用概览">
                <MetricCard label="Token 用量" value={summary && !tokensAllUnknown ? fmtTokens(summary.totalTokens) : DASH} detail={summary ? `输入 ${fmtTokens(summary.inputTokens + summary.cacheReadTokens + summary.cacheWriteTokens)} · 输出 ${fmtTokens(summary.outputTokens)}` : undefined} onClick={() => jump("tokens")} />
                <MetricCard label="费用" value={!summary || summary.requestCount === 0 ? DASH : costKnown ? fmtUsd(cost!.costUsd) : "费用未知"} detail={costDetailText}
                  tip={cost?.unverifiedHistoricalRequestCount ? "包含来源未验证的历史记录" : undefined} onClick={() => { update({ trendMetric: "cost" }); jump("trend"); }} />
                <MetricCard label="缓存命中率" value={summary ? fmtCacheHit(summary) : DASH} detail={summary ? `缓存读取 ${fmtTokens(summary.cacheReadTokens)}` : undefined} onClick={() => jump("tokens")} />
                <MetricCard label="模型请求" value={fmtInt(summary?.requestCount)} detail={summary ? `失败 ${fmtInt(summary.failedRequestCount)} · 重试 ${fmtInt(summary.retryCount)}` : undefined} onClick={() => openDetail("models")} />
                <MetricCard label="工具调用" value={fmtInt(toolCalls)} detail={bashCalls == null ? undefined : `Bash 命令 ${fmtInt(bashCalls)} 次`} onClick={() => jump("tools")} />
              </MetricRow>
              {gap ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="-mt-2 w-fit max-w-full rounded-act-xs text-act-xxs text-text-faint hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{gap.text}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[340px]"><ul className="m-0 list-none p-0">{gap.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></TooltipContent>
                </Tooltip>
              ) : null}

              <CardGrid>
                <StatsCard id="tokens" title="Token 统计" icon={Database} span={6} flash={flashId === "tokens"}
                  aside={<SmallTabs ariaLabel="Token 统计视图" value={prefs.tokenView} onChange={(tokenView) => update({ tokenView })} options={[{ value: "type", label: "按类型" }, { value: "model", label: "按模型" }]} />}>
                  <Donut ariaLabel="Token 构成" segments={tokenSegments} centerValue={fmtTokens(summary?.totalTokens)} centerLabel="总用量" />
                </StatsCard>
                <StatsCard id="time" title="耗时统计" icon={Clock} span={6} flash={flashId === "time"}
                  aside={<SmallTabs ariaLabel="耗时统计视图" value={prefs.timeView} onChange={(timeView) => update({ timeView })} options={[{ value: "phase", label: "按阶段" }, { value: "tool", label: "按工具" }]} />}
                  note={prefs.timeView === "tool" ? harnessNote : undefined}
                  footer={prefs.timeView === "phase"
                    ? `首字等待 = 发出请求到第一个 token；模型输出 = 第一个 token 到结束（思考与回复合在一起）。${timeUntimed > 0 ? `${fmtInt(timeUntimed)} 次请求没有首字记录，未计入。` : ""}`
                    : "各工具从开始执行到出结果的时间，不含等待审批。"}>
                  <Donut ariaLabel="耗时构成" segments={timeSegments} centerValue={fmtDuration(timeTotal)} centerLabel={prefs.timeView === "phase" ? "合计" : "工具合计"} />
                </StatsCard>

                <StatsCard id="trend" title="用量趋势" icon={ChartColumn} span={8} flash={flashId === "trend"}
                  aside={<SmallTabs ariaLabel="用量趋势指标" value={prefs.trendMetric} onChange={(trendMetric) => update({ trendMetric })} options={[{ value: "tokens", label: "Token" }, { value: "cost", label: "费用" }, { value: "requests", label: "请求" }]} />}>
                  {trend ? (
                    <>
                      <div className="mb-2 flex flex-col gap-0.5 text-act-xxs text-text-faint">
                        <span>{trend.unitWord}最高 {fmtTrend(prefs.trendMetric, trend.max)}</span>
                        <span>{trend.unitWord}平均 {fmtTrend(prefs.trendMetric, trend.average)}</span>
                      </div>
                      <BarChart ariaLabel="用量趋势" data={trend.bars} xLabels={trend.xLabels} />
                    </>
                  ) : null}
                </StatsCard>
                <StatsCard id="heat" title="活跃度" icon={Gauge} span={4} flash={flashId === "heat"} note={anyFilter ? "不受筛选影响" : undefined}
                  aside={<SmallTabs ariaLabel="活跃度指标" value={prefs.heatMetric} onChange={(heatMetric) => update({ heatMetric })} options={[{ value: "sessions", label: "会话" }, { value: "tokens", label: "Token" }]} />}>
                  <Heatmap ariaLabel="最近 14 周活跃度" values={heatValues} unit={prefs.heatMetric === "sessions" ? "个会话" : "token"} formatValue={prefs.heatMetric === "sessions" ? fmtInt : fmtTokens} />
                </StatsCard>

                <StatsCard id="skills" title="技能加载" icon={BookOpen} span={3} flash={flashId === "skills"} note={harnessNote}
                  aside={data?.skills ? `${fmtInt(data.skills.reduce((sum, skill) => sum + skill.skillReads, 0))} 次` : undefined}>
                  <RankList ariaLabel="技能加载" color="var(--act-context-skills)" rows={(data?.skills ?? []).map(skillRank)} empty="这段时间没有读过 Skill" />
                </StatsCard>
                <StatsCard id="tools" title="工具调用" icon={Code} span={3} flash={flashId === "tools"} note={harnessNote}
                  aside={toolCalls == null ? undefined : `${fmtInt(toolCalls)} 次`}>
                  <RankList ariaLabel="工具调用" color="var(--act-context-tools)" rows={(data?.tools ?? []).map(toolRank)} />
                </StatsCard>
                <StatsCard id="commands" title="命令执行" icon={Terminal} span={3} flash={flashId === "commands"} note={harnessNote}
                  aside={bashCalls == null ? undefined : `${fmtInt(bashCalls)} 次`}>
                  <RankList ariaLabel="命令执行" color="var(--act-context-rules)" rows={(data?.commands ?? []).map(commandRank)} />
                </StatsCard>
                <StatsCard id="agents" title="子 Agent 与辅助模型" icon={Bot} span={3} flash={flashId === "agents"} note={harnessNote}>
                  <StatsScroll>
                    <SubHeading aside={fmtUsd(data?.subagents?.reduce((sum, row) => sum + row.costUsd, 0))}>子 Agent</SubHeading>
                    <RankList scroll={false} ariaLabel="子 Agent" color="var(--act-context-summarized)" empty="没有调用子 Agent" rows={(data?.subagents ?? []).map((row) => ({
                      key: row.preset, name: row.preset, value: row.calls,
                      sub: `平均 ${fmtDuration(average(row.durationMs, row.durationSamples))} · ${fmtTokens(row.totalTokens)} · ${fmtUsd(row.costUsd)}`,
                      detail: { title: row.preset, mono: true, rows: [["失败", `${fmtInt(row.failed)} 次`], ["平均耗时", fmtDuration(average(row.durationMs, row.durationSamples))], ["Token / 费用", `${fmtTokens(row.totalTokens)} / ${fmtUsd(row.costUsd)}`]] },
                    }))} />
                    <div className="h-3" />
                    <SubHeading aside={fmtUsd(data?.auxiliary?.reduce((sum, row) => sum + row.costUsd, 0))}>辅助模型</SubHeading>
                    <RankList scroll={false} mono={false} ariaLabel="辅助模型" color="var(--act-context-system)" empty="没有辅助模型请求" rows={(data?.auxiliary ?? []).map((row) => ({
                      key: row.purpose, name: PURPOSE_LABEL[row.purpose] ?? row.purpose, value: row.calls, sub: fmtUsd(row.costUsd),
                      detail: { title: PURPOSE_LABEL[row.purpose] ?? row.purpose, rows: [["调用", `${fmtInt(row.calls)} 次`], ["费用", fmtUsd(row.costUsd)], ["平均每次", fmtUsd(average(row.costUsd, row.calls), true)]] },
                    }))} />
                  </StatsScroll>
                </StatsCard>
              </CardGrid>

              <DetailSection id="detail" flash={flashId === "detail"}>
                <UnderlineTabs ariaLabel="明细分类" idPrefix="usage-detail" value={prefs.activeTab} onChange={(activeTab) => update({ activeTab })} tabs={[
                  { value: "requests", label: "请求明细", count: fmtInt(data?.rowsPage.totalRows) },
                  { value: "models", label: "模型", count: fmtInt(data?.aggregates?.models.length) },
                  { value: "providers", label: "提供商", count: fmtInt(data?.aggregates?.providers.length) },
                  { value: "tools", label: "工具", count: fmtInt(data?.tools?.length) },
                  { value: "commands", label: "命令", count: fmtInt(data?.commands?.length) },
                  { value: "skills", label: "Skills", count: fmtInt(data?.skills?.length) },
                ]} />
                <div role="tabpanel" aria-labelledby={`usage-detail-tab-${prefs.activeTab}`} className="flex min-w-0 flex-col gap-2.5">
                  {prefs.activeTab === "requests" ? (
                    <DataTable ariaLabel="请求明细" columns={REQUEST_COLUMNS} rows={data?.rows ?? []} rowKey={(row) => row.activityId} empty="所选范围内暂无请求"
                      footer={data ? <Pager page={data.rowsPage.page} totalPages={data.rowsPage.totalPages} totalRows={data.rowsPage.totalRows} busy={isLoading} onPageChange={query} /> : null} />
                  ) : prefs.activeTab === "models" ? (
                    <DataTable ariaLabel="模型" columns={MODEL_COLUMNS} rows={modelsWithLabels(data?.aggregates?.models ?? [])} rowKey={(row) => row.key} sort={modelSort} onSortChange={setModelSort} />
                  ) : prefs.activeTab === "providers" ? (
                    <DataTable ariaLabel="提供商" columns={PROVIDER_COLUMNS} rows={providerRows(data)} rowKey={(row) => row.key} defaultSort={{ key: "cost", dir: "desc" }} />
                  ) : prefs.activeTab === "tools" ? (
                    <DataTable ariaLabel="工具" columns={TOOL_COLUMNS} rows={data?.tools ?? []} rowKey={(row) => row.name} sort={toolSort} onSortChange={setToolSort} />
                  ) : prefs.activeTab === "commands" ? (
                    <DataTable ariaLabel="命令" columns={COMMAND_COLUMNS} rows={data?.commands ?? []} rowKey={(row) => row.program} defaultSort={{ key: "calls", dir: "desc" }} />
                  ) : (
                    <DataTable ariaLabel="Skills" columns={SKILL_COLUMNS} rows={data?.skills ?? []} rowKey={(row) => row.skillId} defaultSort={{ key: "reads", dir: "desc" }} />
                  )}
                </div>
                {isLoading && data ? <p role="status" className="text-act-xs text-text-faint">正在刷新…</p> : null}
              </DetailSection>
            </>
          )}
        </div>
      </PageShell>
    </div>
  );
}

// ---------------------------------------------------------------- 排行行

function skillRank(skill: UsageSkillRow): RankRow {
  return {
    key: skill.skillId, name: skill.skillId, value: skill.skillReads,
    sub: `读 SKILL.md ${fmtInt(skill.skillReads)}${skill.assetReads ? ` · 附属文件 ${fmtInt(skill.assetReads)}` : ""}`,
    detail: { title: skill.skillId, mono: true, rows: [["最近一次", fmtRelativeDay(skill.lastReadAt)], ...skill.files.map((file) => ["读过", file] as const)] },
  };
}

function failureRows(codes: Record<string, number>): (readonly [string, string])[] {
  const entries = Object.entries(codes).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([code, count]) => [`失败：${failureLabel(code)}`, `${fmtInt(count)} 次`] as const) : [["失败", "0"] as const];
}

function toolRank(tool: UsageToolRow): RankRow {
  const rate = ratio(tool.failed, tool.calls) ?? 0;
  const avg = average(tool.durationMs, tool.durationSamples);
  return {
    key: tool.name, name: tool.name, value: tool.calls,
    sub: `平均 ${fmtDuration(avg)}${tool.failed ? ` · 失败 ${fmtInt(tool.failed)}` : ""}`,
    tag: rate > 0.05 ? <Pill tone="err">{fmtPct(rate)}</Pill> : undefined,
    detail: { title: tool.name, mono: true, rows: [
      ["平均 / P95 耗时", `${fmtDuration(avg)} / ${tool.p95Ms == null ? DASH : `约 ${fmtDuration(tool.p95Ms)}`}`],
      ["平均输出", tool.outputSamples ? `≈${fmtTokens(average(tool.outputTokens, tool.outputSamples))} token` : DASH],
      ...failureRows(tool.failureCodes),
    ] },
  };
}

function commandRank(command: UsageCommandRow): RankRow {
  const rate = ratio(command.failed, command.calls) ?? 0;
  const avg = fmtDuration(average(command.durationMs, command.durationSamples));
  const subs = SUBCOMMAND_PROGRAMS.has(command.program) && command.subcommands.length > 0;
  return {
    key: command.program, name: command.program, value: command.calls,
    sub: subs ? command.subcommands.slice(0, 4).map((sub) => `${sub.name} ${fmtInt(sub.calls)}`).join(" · ") : `平均 ${avg}${command.failed ? ` · 失败 ${fmtInt(command.failed)}` : ""}`,
    tag: rate > 0.1 ? <Pill tone="err">失败 {fmtInt(command.failed)}</Pill> : undefined,
    detail: { title: command.program, mono: true, rows: [
      ["失败", `${fmtInt(command.failed)} 次（${fmtPct(rate)}）`],
      ["平均耗时", avg],
      ...command.subcommands.map((sub) => [`${command.program} ${sub.name}`, `${fmtInt(sub.calls)} 次`] as const),
    ] },
  };
}

// ---------------------------------------------------------------- 明细表列

const mono = "font-mono";
const faint = (text: string) => <span className="text-text-subtle">{text}</span>;

const REQUEST_COLUMNS: TableColumn<UsageActivityRow>[] = [
  { key: "time", label: "时间", render: (row) => <span className="tabular-nums text-text-muted">{fmtDateTime(row.startedAt)}</span> },
  { key: "session", label: "会话", className: "max-w-[200px]", render: (row) => <span className="text-text-muted" title={row.sessionTitle ?? row.sessionId}>{row.sessionTitle ?? `未命名会话 · ${row.sessionId.slice(0, 8)}`}</span> },
  { key: "model", label: "模型", render: (row) => (
    <span className="inline-flex items-center gap-1.5">
      <HoverValue label={`${row.model ?? "未知模型"} 单价`} align="start" detail={priceDetail(row)}><span className={mono}>{row.model?.replace(/^[^:]+:/, "") ?? "未知模型"}</span></HoverValue>
      {row.purpose ? <Pill>{PURPOSE_LABEL[row.purpose] ?? row.purpose}</Pill> : null}
    </span>
  ) },
  { key: "ttft", label: "首字", align: "right", render: (row) => (row.ttftMs == null ? faint(DASH) : fmtDuration(row.ttftMs)) },
  { key: "duration", label: "耗时", align: "right", render: (row) => {
    const detail = timeDetail(row);
    return detail ? <HoverValue label="耗时明细" detail={detail}>{fmtDuration(row.durationMs)}</HoverValue> : faint(DASH);
  } },
  { key: "tokens", label: "Token", align: "right", render: (row) => {
    const detail = tokenDetail(row.tokens);
    return detail ? <HoverValue label="Token 明细" detail={detail}>{fmtInt(row.tokens.totalTokens)}</HoverValue> : faint(DASH);
  } },
  { key: "cost", label: "费用", align: "right", render: (row) => {
    const detail = costDetail(row);
    if (detail) return <HoverValue label="费用明细" detail={detail}>{fmtUsd(row.costAmount, true)}</HoverValue>;
    return row.costProvenance?.reason === "model-price-unavailable" && row.tokens.totalTokens != null
      ? <span className="text-text-subtle" title="该模型未配置价格">未知</span>
      : faint("未知");
  } },
  { key: "status", label: "状态", render: (row) => <Pill tone={STATUS_PILL[row.status].tone}>{STATUS_PILL[row.status].label}</Pill> },
];

type ModelRow = UsageActivityAggregate & { displayLabel: string };
const MODEL_COLUMNS: TableColumn<ModelRow>[] = [
  { key: "model", label: "模型", mono: true, render: (row) => row.label, sortValue: (row) => row.label },
  { key: "provider", label: "提供商", render: (row) => <span className="text-text-muted">{row.providerId ?? DASH}</span>, sortValue: (row) => row.providerId ?? "" },
  { key: "requests", label: "请求", align: "right", render: (row) => fmtInt(row.count), sortValue: (row) => row.count },
  { key: "tokens", label: "Token", align: "right", render: (row) => <HoverValue label="Token 明细" detail={modelTokenDetail(row)}>{fmtTokens(row.totalTokens)}</HoverValue>, sortValue: (row) => row.totalTokens },
  { key: "cache", label: "缓存命中", align: "right", render: (row) => fmtCacheHit(row), sortValue: (row) => cacheHitRate(row) },
  { key: "ttft", label: "首字", align: "right", render: (row) => fmtDuration(average(row.ttftMs, row.ttftSamples)), sortValue: (row) => average(row.ttftMs, row.ttftSamples) },
  { key: "speed", label: "速度", align: "right", render: (row) => { const speed = modelSpeed(row); return speed == null ? DASH : `${Math.round(speed)} tok/s`; }, sortValue: modelSpeed },
  { key: "cost", label: "费用", align: "right", render: (row) => {
    const detail = modelCostDetail(row);
    return detail ? <HoverValue label="费用明细" detail={detail}>{fmtUsd(row.costSummary.costUsd)}</HoverValue> : faint("费用未知");
  }, sortValue: (row) => (row.costSummary.knownCostRequestCount ? row.costSummary.costUsd : null) },
];

type ProviderRow = UsageActivityAggregate & { modelCount: number };
function providerRows(data: UsageActivitySnapshot | null): ProviderRow[] {
  const models = data?.aggregates?.models ?? [];
  return (data?.aggregates?.providers ?? []).map((provider) => ({ ...provider, modelCount: models.filter((model) => model.key.startsWith(`${provider.key}/`)).length }));
}
const PROVIDER_COLUMNS: TableColumn<ProviderRow>[] = [
  { key: "provider", label: "提供商", mono: true, render: (row) => row.label, sortValue: (row) => row.label },
  { key: "models", label: "模型数", align: "right", render: (row) => fmtInt(row.modelCount), sortValue: (row) => row.modelCount },
  { key: "requests", label: "请求", align: "right", render: (row) => fmtInt(row.count), sortValue: (row) => row.count },
  { key: "failed", label: "失败", align: "right", render: (row) => fmtInt(row.errorCount), sortValue: (row) => row.errorCount },
  { key: "tokens", label: "Token", align: "right", render: (row) => fmtTokens(row.totalTokens), sortValue: (row) => row.totalTokens },
  { key: "cost", label: "费用", align: "right", render: (row) => (row.costSummary.knownCostRequestCount ? fmtUsd(row.costSummary.costUsd) : faint("费用未知")), sortValue: (row) => (row.costSummary.knownCostRequestCount ? row.costSummary.costUsd : null) },
];

const failRate = (row: { failed: number; calls: number }) => ratio(row.failed, row.calls);
const TOOL_COLUMNS: TableColumn<UsageToolRow>[] = [
  { key: "tool", label: "工具", mono: true, render: (row) => row.name, sortValue: (row) => row.name },
  { key: "calls", label: "调用", align: "right", render: (row) => fmtInt(row.calls), sortValue: (row) => row.calls },
  { key: "failed", label: "失败", align: "right", render: (row) => fmtInt(row.failed), sortValue: (row) => row.failed },
  { key: "rate", label: "失败率", align: "right", render: (row) => fmtPct(failRate(row)), sortValue: failRate },
  { key: "avg", label: "平均耗时", align: "right", render: (row) => fmtDuration(average(row.durationMs, row.durationSamples)), sortValue: (row) => average(row.durationMs, row.durationSamples) },
  { key: "p95", label: "P95", align: "right", render: (row) => (row.p95Ms == null ? DASH : `约 ${fmtDuration(row.p95Ms)}`), sortValue: (row) => row.p95Ms },
  { key: "output", label: "平均输出", align: "right", render: (row) => (row.outputSamples ? `≈${fmtTokens(average(row.outputTokens, row.outputSamples))}` : DASH), sortValue: (row) => average(row.outputTokens, row.outputSamples) },
];

const COMMAND_COLUMNS: TableColumn<UsageCommandRow>[] = [
  { key: "program", label: "程序", mono: true, render: (row) => row.program, sortValue: (row) => row.program },
  { key: "calls", label: "次数", align: "right", render: (row) => fmtInt(row.calls), sortValue: (row) => row.calls },
  { key: "failed", label: "失败", align: "right", render: (row) => fmtInt(row.failed), sortValue: (row) => row.failed },
  { key: "rate", label: "失败率", align: "right", render: (row) => fmtPct(failRate(row)), sortValue: failRate },
  { key: "avg", label: "平均耗时", align: "right", render: (row) => fmtDuration(average(row.durationMs, row.durationSamples)), sortValue: (row) => average(row.durationMs, row.durationSamples) },
  { key: "subs", label: "子命令", className: "max-w-[260px]", render: (row) => (row.subcommands.length ? <span className="text-text-muted">{row.subcommands.map((sub) => `${sub.name} ${fmtInt(sub.calls)}`).join(" · ")}</span> : faint(DASH)) },
];

const SKILL_COLUMNS: TableColumn<UsageSkillRow>[] = [
  { key: "skill", label: "Skill", mono: true, render: (row) => row.skillId, sortValue: (row) => row.skillId },
  { key: "reads", label: "读 SKILL.md", align: "right", render: (row) => fmtInt(row.skillReads), sortValue: (row) => row.skillReads },
  { key: "assets", label: "读附属文件", align: "right", render: (row) => fmtInt(row.assetReads), sortValue: (row) => row.assetReads },
  { key: "last", label: "最近一次", align: "right", render: (row) => fmtRelativeDay(row.lastReadAt), sortValue: (row) => row.lastReadAt },
];
