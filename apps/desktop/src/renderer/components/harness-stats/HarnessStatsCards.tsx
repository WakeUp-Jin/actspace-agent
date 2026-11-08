import { CircleX, Database, Eye, GitCompare, Info, Layers, Scale, Shrink, TriangleAlert, X, Zap, ChevronRight } from "lucide-react";
import type {
  HarnessFlag,
  HarnessRevisionMetrics,
  HarnessStatsContext,
  HarnessStatsDisclosure,
  HarnessStatsOverview,
  HarnessStatsPlugins,
  HarnessStatsRange,
  HarnessStatsUsageVs,
  HarnessStatsVersions,
} from "@actspace/shared";
import { HARNESS_ACTIVE_PATH_LIMIT, HARNESS_COMPARE_MIN_REQUESTS } from "@actspace/shared";
import {
  BarChart,
  Donut,
  EmptyState,
  KvList,
  MetricCard,
  MetricRow,
  Pill,
  RankList,
  SmallTabs,
  Stats3,
  StatsCard,
  SubHeading,
  type DeltaTone,
  type PillTone,
} from "../stats/stats-ui";
import { DASH, fmtDateTime, fmtDuration, fmtInt, fmtPct, fmtTokens, ratio } from "../stats/stats-format";
import { SettingsSelect } from "../settings/SettingsPrimitives";
import { PlainButton } from "../ui/PlainButton";
import { cn } from "../ui/cn";
import {
  ACTIVE_HISTOGRAM_LABELS,
  RANGE_WORD,
  SLEEP_HISTOGRAM_LABELS,
  SOURCE_LABEL,
  bucketColor,
  bucketLabel,
  bucketSegments,
  costPerUse,
  fmtPoints,
  fmtSignedInt,
  fmtSignedPct,
  fmtSignedTokens,
  isChurning,
  isFlat,
  revisionLabel,
  triggerLabel,
  usageVerdict,
  type UsageVerdict,
} from "./harness-stats-format";
import { CompareGrid, Explainer, Pending, type CompareRow } from "./harness-stats-parts";

/* 「Harness 统计」页的值得关注、5 张指标卡和 7 张卡片（front-统计页规范.md §3.2–3.4）。
   卡片里的 tab / 选中类别 / 展开行由页面持有，值得关注和指标卡点击时要能改它们。 */

export type UsageTab = "tools" | "plugins" | "skills";
export type CompactionView = "summary" | "recent";
export type DisclosureView = "active" | "sleep" | "paths";
export type RuntimeTab = "services" | "listeners" | "load";

export const USAGE_TABS: readonly { value: UsageTab; label: string }[] = [{ value: "tools", label: "工具" }, { value: "plugins", label: "插件" }, { value: "skills", label: "Skills" }];
const USAGE_NOUN: Record<UsageTab, string> = { tools: "工具", plugins: "插件", skills: "Skill" };
const USAGE_PREVIEW = 7;

// ---------------------------------------------------------------- 值得关注

const FLAG_ICON = {
  error: <CircleX size={15} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 text-danger" />,
  warn: <TriangleAlert size={15} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 text-warning" />,
  info: <Info size={15} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 text-info" />,
} as const;

export function FlagsBlock({ flags, onOpen }: { flags: readonly HarnessFlag[]; onOpen: (flag: HarnessFlag) => void }) {
  if (flags.length === 0) return null;
  return (
    <section aria-label="值得关注" className="overflow-hidden rounded-act-lg border border-line bg-surface">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-2.5">
        <h3 className="m-0 text-act-sm font-semibold text-text-main">值得关注</h3>
        <span className="ml-auto text-act-xs text-text-faint">{flags.length} 项 · 点击跳到对应卡片</span>
      </div>
      {flags.map((flag, index) => (
        <PlainButton key={`${flag.rule}:${flag.target.key ?? index}`} onClick={() => onOpen(flag)}
          className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-line px-3.5 py-2 transition-colors duration-(--motion-fast) hover:bg-hover-overlay">
          {FLAG_ICON[flag.level]}
          <span className="min-w-0">
            <span className="block text-act-sm font-medium text-text-main">{flag.title}</span>
            <span className="mt-px block text-act-xs text-text-faint">{flag.detail}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-0.5 whitespace-nowrap text-act-xxs text-text-subtle">{flag.category}<ChevronRight size={13} strokeWidth={1.9} aria-hidden="true" /></span>
        </PlainButton>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- 指标卡

type Delta = { tone: DeltaTone; text: string };
const NO_PREVIOUS: Delta = { tone: "flat", text: "没有上一个版本可比" };

/** 越低越好：变小 = 绿，变大 = 红，持平 = 灰。 */
function lowerIsBetter(current: number | null, previous: number | null, previousLabel: string, format: (value: number) => string): Delta {
  if (current == null || previous == null) return { tone: "flat", text: `比 ${previousLabel} ${DASH}` };
  const diff = current - previous;
  return { tone: isFlat(diff) ? "flat" : diff < 0 ? "good" : "bad", text: `比 ${previousLabel} ${isFlat(diff) ? "持平" : format(diff)}` };
}

const wasteRate = (metrics: HarnessRevisionMetrics | null): number | null => {
  if (!metrics || (metrics.repeatRate == null && metrics.truncateRate == null)) return null;
  return Math.min(1, (metrics.repeatRate ?? 0) + (metrics.truncateRate ?? 0));
};

export type MetricTarget = "overhead" | "cache" | "failure" | "waste" | "reread";

export function HarnessMetrics({ overview, revisions, onOpen }: {
  overview: HarnessStatsOverview | null;
  revisions: Parameters<typeof revisionLabel>[1];
  onOpen: (target: MetricTarget) => void;
}) {
  const m = overview?.metrics ?? null;
  const p = overview?.previousMetrics ?? null;
  const prevLabel = revisionLabel(overview?.previous, revisions);
  const delta = (current: number | null, previous: number | null, format: (value: number) => string): Delta | undefined =>
    !overview ? undefined : !overview.previous ? NO_PREVIOUS : lowerIsBetter(current, previous, prevLabel, format);
  return (
    <MetricRow label="Harness 指标">
      <MetricCard label="Harness 固定开销" value={fmtTokens(m?.fixedOverheadTokens)}
        detail={m ? `每次请求 · 占窗口 ${fmtPct(ratio(m.fixedOverheadTokens, m.avgContextWindow))}` : " "}
        tip="系统提示词 + 工具定义 + 规则 + Skills 目录，不含对话。每次请求都要先付这一笔。"
        delta={delta(m?.fixedOverheadTokens ?? null, p?.fixedOverheadTokens ?? null, fmtSignedTokens)} onClick={() => onOpen("overhead")} />
      <MetricCard label="缓存被打断" value={fmtPct(m?.cacheBrokenRate)}
        detail={m ? `的请求 · 这些请求缓存命中 ${fmtPct(m.cacheHitBroken, 0)}，其他 ${fmtPct(m.cacheHitOther, 0)}` : " "}
        tip="Harness 自己的内容（规则、环境信息、工具列表…）和同一会话上一次请求不一样的请求占比。后面的数字对比这些请求和其他请求的实际缓存命中率，差得越多，说明打断越伤。"
        delta={delta(m?.cacheBrokenRate ?? null, p?.cacheBrokenRate ?? null, (value) => fmtPoints(value))} onClick={() => onOpen("cache")} />
      <MetricCard label="工具失败率" value={fmtPct(m?.toolFailureRate)}
        detail={m ? (m.topFailedTool ? `最多：${m.topFailedTool.name} ${fmtInt(m.topFailedTool.failed)} 次` : "没有失败的调用") : " "}
        tip="工具调用里返回失败的比例。点开看每个工具的失败率。"
        delta={delta(m?.toolFailureRate ?? null, p?.toolFailureRate ?? null, (value) => fmtPoints(value))} onClick={() => onOpen("failure")} />
      <MetricCard label="白费的工具调用" value={fmtPct(wasteRate(m))}
        detail={m ? `重复 ${fmtPct(m.repeatRate)} · 截断 ${fmtPct(m.truncateRate)}` : " "}
        tip="同参数重复：同一轮里用一模一样的参数又调了一次。输出截断：结果太长被截掉，模型往往要再读一次。两者多说明工具描述或输出设计有问题。"
        delta={delta(wasteRate(m), wasteRate(p), (value) => fmtPoints(value))} onClick={() => onOpen("waste")} />
      <MetricCard label="压缩后重读率" value={fmtPct(m?.rereadRate, 0)}
        detail={m ? `压缩 ${fmtInt(m.compactions)} 次 · 拿掉 ${fmtTokens(m.foldedTokens)}` : " "}
        tip="压缩后 5 步内又去读压缩前读过的文件。越高说明摘要丢了模型还需要的东西。"
        delta={delta(m?.rereadRate ?? null, p?.rereadRate ?? null, (value) => fmtPoints(value, 0))} onClick={() => onOpen("reread")} />
    </MetricRow>
  );
}

// ---------------------------------------------------------------- 占用 vs 使用

type BillRow = {
  key: string;
  name: string;
  tag: string;
  tokens: number;
  requests: number;
  calls: number;
  per: number;
  verdict: UsageVerdict;
  extra: readonly { label: string; value: string; mono?: boolean }[];
};

const VERDICT_PILL: Record<Exclude<UsageVerdict, "ok">, { tone: PillTone; label: string; tip: string }> = {
  dead: { tone: "err", label: "从未调用", tip: "一直占着上下文，一次没用" },
  hot: { tone: "warn", label: "占用高 · 少用", tip: "可以删掉，或改成需要时再加载" },
};
const PER_CLASS: Record<UsageVerdict, string> = { dead: "text-on-danger", hot: "text-on-warning", ok: "text-text-main" };

function billRows(data: HarnessStatsUsageVs, tab: UsageTab): BillRow[] {
  const make = (key: string, name: string, tag: string, tokens: number, requests: number, calls: number, extra: BillRow["extra"]): BillRow =>
    ({ key, name, tag, tokens, requests, calls, per: costPerUse(tokens, requests, calls), verdict: usageVerdict(calls, requests, tokens), extra });
  const rows = tab === "tools"
    ? data.tools.map((tool) => make(tool.name, tool.name, tool.pluginId ?? "未知插件", tool.schemaTokens ?? 0, tool.exposures, tool.calls, [
        { label: "所属插件", value: tool.pluginId ?? DASH, mono: true },
        { label: "失败率", value: fmtPct(ratio(tool.failed, tool.calls)) },
        { label: "调用率", value: fmtPct(ratio(tool.calls, tool.exposures), 2) },
      ]))
    : tab === "plugins"
      ? data.plugins.map((plugin) => make(plugin.pluginId, plugin.pluginId, SOURCE_LABEL[plugin.source], plugin.schemaTokens ?? 0, plugin.exposures, plugin.calls, [
          { label: "来源", value: SOURCE_LABEL[plugin.source] },
          { label: "工具", value: plugin.tools.join("、") || DASH, mono: true },
        ]))
      : data.skills.map((skill) => make(skill.id, skill.id, "Skill", skill.catalogTokens ?? 0, skill.listed, skill.skillReads, [
          { label: "读附属文件", value: `${fmtInt(skill.assetReads)} 次` },
          { label: "目录里的描述", value: `≈${fmtInt(skill.catalogTokens)} token` },
        ]));
  return rows.sort((a, b) => b.per - a.per || b.tokens - a.tokens || a.name.localeCompare(b.name));
}

export function UsageVsCard({ error, onRetry, data, range, tab, onTabChange, open, onToggle, all, onToggleAll, flash }: {
  error: string | null;
  onRetry: () => void;
  data: HarnessStatsUsageVs | null;
  range: HarnessStatsRange;
  tab: UsageTab;
  onTabChange: (tab: UsageTab) => void;
  open: ReadonlySet<string>;
  onToggle: (key: string) => void;
  all: boolean;
  onToggleAll: () => void;
  flash: boolean;
}) {
  const noun = tab === "skills" ? "读取" : "调用";
  const rows = data ? billRows(data, tab) : [];
  // 展开的行（例如从值得关注跳过来）即使排在 7 名之后也要显示。
  const visible = rows.filter((row, index) => all || index < USAGE_PREVIEW || open.has(row.key));
  return (
    <StatsCard id="usage-vs" title="占用 vs 使用" icon={Scale} span={12} flash={flash}
      aside={<SmallTabs ariaLabel="占用 vs 使用分类" value={tab} options={USAGE_TABS} onChange={onTabChange} />}
      footer={data && rows.length > 0 ? (
        <>
          <span>点一行看详情。</span>
          {rows.length > USAGE_PREVIEW ? (
            <PlainButton onClick={onToggleAll} className="ml-auto rounded-act-xs text-text-muted hover:text-text-main">{all ? "收起" : `显示全部 ${rows.length} 个`}</PlainButton>
          ) : null}
        </>
      ) : undefined}>
      <Explainer>
        每个{USAGE_NOUN[tab]}的说明每次请求都要带上。把{RANGE_WORD[range]}带的 token 加起来，除以真正{noun}的次数，就是<b className="font-medium text-text-main">每用一次花了多少 token</b>。数字越大越不划算。
      </Explainer>
      {!data ? <Pending error={error} onRetry={onRetry} /> : rows.length === 0 ? <EmptyState /> : (
        <ul aria-label={`${USAGE_NOUN[tab]}每用一次花多少`} className="m-0 flex list-none flex-col p-0">
          {visible.map((row, index) => {
            const expanded = open.has(row.key);
            const pill = row.verdict === "ok" ? null : VERDICT_PILL[row.verdict];
            return (
              <li key={row.key}>
                <PlainButton aria-expanded={expanded} onClick={() => onToggle(row.key)}
                  className={cn("grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-act-sm border-b border-line px-1.5 py-2 transition-colors duration-(--motion-fast) hover:bg-hover-overlay",
                    expanded && "bg-hover-overlay")}>
                  <span className="text-right text-act-xs tabular-nums text-text-subtle">{index + 1}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-mono text-act-sm font-medium text-text-main" title={row.name}>{row.name}</span>
                    <Pill>{row.tag}</Pill>
                    {pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : null}
                  </span>
                  <span className="col-start-3 row-span-2 row-start-1 text-right">
                    <b className={cn("block text-act-lg font-semibold tracking-tight tabular-nums", PER_CLASS[row.verdict])}>{row.calls > 0 ? `≈${fmtTokens(row.per)}` : DASH}</b>
                    <span className="text-act-xxs text-text-faint">{row.calls > 0 ? `token / 每${noun}一次` : `一次没${noun}`}</span>
                  </span>
                  <span className="col-start-2 text-act-xs text-text-muted">
                    每次请求带着 <b className="font-medium tabular-nums text-text-main">{fmtInt(row.tokens)}</b> token × <b className="font-medium tabular-nums text-text-main">{fmtInt(row.requests)}</b> 次请求 = <b className="font-medium tabular-nums text-text-main">{fmtTokens(row.tokens * row.requests)}</b>，{noun}了 <b className="font-medium tabular-nums text-text-main">{fmtInt(row.calls)}</b> 次
                  </span>
                  {expanded ? (
                    <span className="col-span-2 col-start-2 mb-0.5 mt-1.5 block">
                      <KvList rows={[
                        ...row.extra.map((item) => ({ key: item.label, label: item.label, value: item.mono ? <span className="font-mono">{item.value}</span> : item.value })),
                        { key: "advice", label: "建议", value: pill?.tip ?? "保持" },
                      ]} />
                    </span>
                  ) : null}
                </PlainButton>
              </li>
            );
          })}
        </ul>
      )}
    </StatsCard>
  );
}

// ---------------------------------------------------------------- 每次请求里放了什么 / 来源

export function ContextCard({ error, onRetry, data, selected, onSelect, flash }: { error: string | null;
  onRetry: () => void;
  data: HarnessStatsContext | null; selected: string | null; onSelect: (bucket: string | null) => void; flash: boolean }) {
  const segments = data ? bucketSegments(data.buckets) : [];
  return (
    <StatsCard id="ctx" title="每次请求里放了什么" icon={Database} span={6} flash={flash}
      aside={data ? `平均 ${fmtTokens(data.avgEstimatedTokens)} token` : undefined}
      footer="点一个类别，右边只看这一类的来源。">
      {!data ? <Pending error={error} onRetry={onRetry} /> : (
        <Donut ariaLabel="每次请求的上下文构成" centerValue={fmtTokens(data.avgEstimatedTokens)} centerLabel="平均每次请求"
          segments={segments.map((segment) => ({ key: segment.key, label: segment.label, value: segment.tokens, color: `var(${segment.colorVar})`, valueLabel: `≈${fmtTokens(segment.tokens)}` }))}
          selectedKey={selected} onSelect={(key) => onSelect(selected === key ? null : key)} />
      )}
    </StatsCard>
  );
}

export function SourcesCard({ error, onRetry, data, selected, onClear, flash }: { error: string | null;
  onRetry: () => void;
  data: HarnessStatsContext | null; selected: string | null; onClear: () => void; flash: boolean }) {
  const sources = !data ? [] : selected
    ? data.sources.filter((source) => source.bucket === selected).sort((a, b) => b.avgTokens - a.avgTokens)
    : [...data.sources].sort((a, b) => b.avgTokens - a.avgTokens).slice(0, 8);
  return (
    <StatsCard id="sources" title={selected ? `来源 · ${bucketLabel(selected)}` : "最大的上下文来源"} icon={Layers} span={6} flash={flash}
      aside={selected
        ? <PlainButton onClick={onClear} className="inline-flex items-center gap-0.5 rounded-act-xs text-text-muted hover:text-text-main">看全部<X size={12} strokeWidth={2} aria-hidden="true" /></PlainButton>
        : "平均大小 · 变化率"}
      footer="变化率 = 和上一次请求相比内容变了的比例；越高越容易让缓存失效。">
      {!data ? <Pending error={error} onRetry={onRetry} /> : (
        <RankList ariaLabel="上下文来源" empty="这一类没有来源"
          rows={sources.map((source) => {
            const churn = isChurning(source.bucket, source.changeRate);
            return {
              key: source.key,
              name: source.id,
              value: source.avgTokens,
              countLabel: `≈${fmtTokens(source.avgTokens)}${source.changeRate != null && source.bucket !== "conversation" ? ` · 变化 ${fmtPct(source.changeRate, 0)}` : ""}`,
              tag: churn ? <Pill tone="warn">常变 · 打断缓存</Pill> : undefined,
              color: churn ? "var(--act-color-warning)" : bucketColor(source.bucket),
            };
          })} />
      )}
    </StatsCard>
  );
}

// ---------------------------------------------------------------- 压缩

export function CompactionCard({ error, onRetry, data, view, onViewChange, flash }: { error: string | null;
  onRetry: () => void;
  data: HarnessStatsDisclosure | null; view: CompactionView; onViewChange: (view: CompactionView) => void; flash: boolean }) {
  const c = data?.compaction;
  return (
    <StatsCard id="compaction" title="压缩" icon={Shrink} span={6} flash={flash}
      aside={<SmallTabs ariaLabel="压缩视图" value={view} options={[{ value: "summary", label: "概览" }, { value: "recent", label: "最近" }]} onChange={onViewChange} />}>
      {!data || !c ? <Pending error={error} onRetry={onRetry} /> : c.count === 0 ? <EmptyState>这段时间没有压缩</EmptyState> : view === "summary" ? (
        <>
          <Stats3 items={[
            { value: `${fmtInt(c.count)} 次`, label: "压缩次数" },
            { value: `${fmtTokens(c.avgBeforeTokens)}→${fmtTokens(c.avgAfterTokens)}`, label: "平均前后" },
            { value: fmtPct(c.rereadRate, 0), label: "压缩后又重读", tip: "压缩后 5 步内重新读了压缩前读过的文件" },
          ]} />
          <KvList rows={[
            { label: "自动 / 手动 / 失败", value: `${fmtInt(c.auto)} / ${fmtInt(c.manual)} / ${fmtInt(c.failed)}`, tone: c.failed > 0 ? "bad" : undefined },
            { label: "触发时窗口占用", value: fmtPct(c.triggerWindowP50, 0) },
            { label: "平均耗时", value: fmtDuration(c.avgDurationMs) },
            { label: "压缩拿掉的工具输出", value: `${fmtInt(c.foldedOutputs)} 条 · ${fmtTokens(c.foldedTokens)}` },
            { label: "两次压缩间隔", value: c.avgStepsBetween == null ? DASH : `平均 ${Math.round(c.avgStepsBetween)} 步` },
          ]} />
        </>
      ) : (
        <KvList rows={data.records.slice(0, 5).map((record) => ({
          key: record.id,
          label: `${fmtDateTime(record.time)} · ${triggerLabel(record.trigger)}${record.ok ? "" : " · 失败"}`,
          value: `${fmtTokens(record.beforeTokens)} → ${fmtTokens(record.afterTokens)}${record.rereads > 0 ? ` · 重读 ${record.rereads}` : ""}`,
          tone: !record.ok ? "bad" as const : record.rereads > 0 ? "warn" as const : undefined,
        }))} />
      )}
    </StatsCard>
  );
}

// ---------------------------------------------------------------- 渐进式披露

export function DisclosureCard({ error, onRetry, data, view, onViewChange, flash }: { error: string | null;
  onRetry: () => void;
  data: HarnessStatsDisclosure | null; view: DisclosureView; onViewChange: (view: DisclosureView) => void; flash: boolean }) {
  return (
    <StatsCard id="disclosure" title="渐进式披露" icon={Eye} span={6} flash={flash}
      aside={<SmallTabs ariaLabel="披露视图" value={view} options={[{ value: "active", label: "活跃" }, { value: "sleep", label: "睡眠" }, { value: "paths", label: "常读" }]} onChange={onViewChange} />}>
      {!data ? <Pending error={error} onRetry={onRetry} /> : (
        <>
          <Stats3 items={[
            { value: fmtPct(data.activeHitRate, 0), label: "读取命中活跃", tip: "模型读的文件里，有多少本来就在活跃列表里" },
            { value: fmtPct(data.misSleepRate), label: "误睡率", tip: "刚睡下，下一个周期就被读" },
            { value: fmtPct(data.indexConversionRate, 0), label: "查索引后读到", tip: "查了睡眠索引后 5 步内读了里面的文件" },
          ]} />
          {view === "active" ? (
            <>
              <SubHeading aside={`上限 ${HARNESS_ACTIVE_PATH_LIMIT} · 触顶 ${fmtInt(data.capHits)} 次`}>每个周期有多少活跃路径</SubHeading>
              <BarChart ariaLabel="每个周期的活跃路径数分布" height={96} color="var(--act-context-rules)" xLabels={["0", "50", "100"]}
                data={data.activeHistogram.map((value, index) => ({ key: String(index), value, tip: `${ACTIVE_HISTOGRAM_LABELS[index] ?? index} 条：${fmtInt(value)} 个周期` }))} />
            </>
          ) : view === "sleep" ? (
            <>
              <SubHeading aside="误睡 = 睡下后下一个周期就被读">睡了几个周期后被叫醒</SubHeading>
              <BarChart ariaLabel="睡了几个周期后被叫醒" height={96} xLabels={SLEEP_HISTOGRAM_LABELS}
                data={data.sleepHistogram.map((value, index) => ({ key: String(index), value, tip: `${SLEEP_HISTOGRAM_LABELS[index] ?? index} 个周期：${fmtInt(value)} 次`, color: index === 0 ? "var(--act-color-warning)" : "var(--act-context-system)" }))} />
            </>
          ) : data.topPaths.length === 0 ? <EmptyState>这段时间没有读文件</EmptyState> : (
            <KvList rows={data.topPaths.slice(0, 10).map((item) => ({ key: item.path, label: <span className="block truncate font-mono" title={item.path}>{item.path}</span>, value: `${fmtInt(item.reads)} 次` }))} />
          )}
        </>
      )}
    </StatsCard>
  );
}

// ---------------------------------------------------------------- 插件运行时

export const RUNTIME_TABS: readonly { value: RuntimeTab; label: string }[] = [{ value: "services", label: "服务" }, { value: "listeners", label: "监听" }, { value: "load", label: "加载" }];

export function RuntimeCard({ error, onRetry, data, tab, onTabChange, flash }: { error: string | null;
  onRetry: () => void;
  data: HarnessStatsPlugins | null; tab: RuntimeTab; onTabChange: (tab: RuntimeTab) => void; flash: boolean }) {
  return (
    <StatsCard id="runtime" title="插件运行时" icon={Zap} span={6} flash={flash}
      aside={<SmallTabs ariaLabel="插件运行时分类" value={tab} options={RUNTIME_TABS} onChange={onTabChange} />}>
      <Explainer>只按时间和版本统计，不受模式、模型、会话类型筛选影响。</Explainer>
      {!data ? <Pending error={error} onRetry={onRetry} /> : data.runtimeEmpty && tab !== "load" ? <EmptyState>还没有运行时统计</EmptyState> : tab === "services" ? <ServicesView data={data} /> : tab === "listeners" ? <ListenersView data={data} /> : <LoadView data={data} />}
    </StatsCard>
  );
}

function ServicesView({ data }: { data: HarnessStatsPlugins }) {
  const called = data.services.filter((service) => service.calls > 0).sort((a, b) => b.calls - a.calls).slice(0, 6);
  const never = data.services.filter((service) => service.calls === 0).length;
  return (
    <>
      <SubHeading aside="次数 · P95">调用最多的服务</SubHeading>
      <KvList rows={[
        ...called.map((service) => ({
          key: `${service.service}.${service.method}`,
          label: <span className="font-mono">{service.method ? `${service.service}.${service.method}` : service.service}</span>,
          value: `${fmtInt(service.calls)} · ${fmtDuration(service.p95Ms)}`,
          tone: service.errors > 0 ? "warn" as const : undefined,
        })),
        { key: "never", label: "从未被调用的服务", value: `${fmtInt(never)} 个`, tone: never > 0 ? "warn" as const : undefined },
      ]} />
    </>
  );
}

function ListenersView({ data }: { data: HarnessStatsPlugins }) {
  const rows = [...data.listeners].sort((a, b) => b.errors - a.errors || b.calls - a.calls).slice(0, 6);
  if (rows.length === 0) return <EmptyState>这段时间没有监听被触发</EmptyState>;
  return (
    <>
      <SubHeading aside="次数 · 报错">触发最多的监听</SubHeading>
      <KvList rows={rows.map((listener) => ({
        key: `${listener.pluginId}:${listener.event}`,
        label: <span className="font-mono">{listener.pluginId} · {listener.event}</span>,
        value: `${fmtInt(listener.calls)} · ${fmtInt(listener.errors)}`,
        tone: listener.errors > 0 ? "bad" as const : undefined,
      }))} />
    </>
  );
}

function LoadView({ data }: { data: HarnessStatsPlugins }) {
  const notable = data.rows.filter((row) => row.loadFailures > 0 || row.source !== "builtin").sort((a, b) => b.loadFailures - a.loadFailures || a.pluginId.localeCompare(b.pluginId));
  const rest = data.rows.length - notable.length;
  const lastFailure = data.rows.filter((row) => row.lastLoadError).sort((a, b) => b.loadFailures - a.loadFailures)[0];
  return (
    <>
      <SubHeading aside="次数 · 失败">插件加载</SubHeading>
      <KvList rows={[
        { key: "p50", label: "加载耗时 P50", value: data.loadP50Ms == null ? DASH : `约 ${fmtDuration(data.loadP50Ms)}` },
        ...notable.map((row) => ({
          key: row.pluginId,
          label: <><span className="font-mono">{row.pluginId}</span>（{SOURCE_LABEL[row.source]}）</>,
          value: `${fmtInt(row.loads)} 次 · ${row.loadFailures > 0 ? `失败 ${fmtInt(row.loadFailures)}` : "0"}`,
          tone: row.loadFailures > 0 ? "bad" as const : undefined,
        })),
        ...(rest > 0 ? [{ key: "rest", label: `其余 ${rest} 个内置插件`, value: "全部成功" }] : []),
      ]} />
      {lastFailure ? (
        <>
          <SubHeading>最近一次失败</SubHeading>
          <p className="m-0 break-all rounded-act-sm bg-surface-subtle px-2 py-1 font-mono text-act-xxs text-text-muted">{lastFailure.pluginId}: {lastFailure.lastLoadError}</p>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- 版本对比

type Better = "lower" | "higher" | "none";

function compareRow(key: string, label: string, a: number | null | undefined, b: number | null | undefined, better: Better, show: (value: number) => string, diff: (a: number, b: number) => string): CompareRow {
  const from = a == null ? DASH : show(a);
  const to = b == null ? DASH : show(b);
  if (a == null || b == null) return { key, label, from, to, delta: DASH, tone: "flat" };
  const d = b - a;
  const tone: DeltaTone = better === "none" || isFlat(d) ? "flat" : (d < 0) === (better === "lower") ? "good" : "bad";
  return { key, label, from, to, delta: isFlat(d) ? DASH : diff(a, b), tone };
}

const relative = (a: number, b: number) => (a === 0 ? DASH : fmtSignedPct((b - a) / a));

export function VersionsCard({ error, onRetry, data, onCompareChange, flash }: {
  error: string | null;
  onRetry: () => void;
  data: HarnessStatsVersions | null;
  onCompareChange: (compare: { from: string; to: string }) => void;
  flash: boolean;
}) {
  const options = (data?.revisions ?? []).map((info) => ({ value: info.key, label: `${revisionLabel(info.key, data?.revisions)} · ${fmtInt(info.requests)} 次` }));
  const from = data?.from ?? null;
  const to = data?.to ?? null;
  const A = data?.fromMetrics ?? null;
  const B = data?.toMetrics ?? null;
  const fromLabel = revisionLabel(from, data?.revisions);
  const toLabel = revisionLabel(to, data?.revisions);
  const requests = (key: string | null, metrics: HarnessRevisionMetrics | null) => metrics?.requests ?? data?.revisions.find((info) => info.key === key)?.requests ?? 0;
  const ra = requests(from, A);
  const rb = requests(to, B);
  const ready = data && from && to;
  return (
    <StatsCard id="versions" title="版本对比" icon={GitCompare} span={6} flash={flash}
      aside={ready ? (
        <>
          <SettingsSelect size="sm" ariaLabel="对比的旧版本" value={from} options={options} onChange={(value) => onCompareChange({ from: value, to })} />
          <span aria-hidden="true">→</span>
          <SettingsSelect size="sm" ariaLabel="对比的新版本" value={to} options={options} onChange={(value) => onCompareChange({ from, to: value })} />
        </>
      ) : undefined}
      footer={ready ? `${fromLabel}：${fmtInt(ra)} 次请求 · ${toLabel}：${fmtInt(rb)} 次请求${Math.min(ra, rb) < HARNESS_COMPARE_MIN_REQUESTS ? " · 样本偏少" : ""}` : undefined}>
      {!data ? <Pending error={error} onRetry={onRetry} /> : !ready ? <EmptyState>至少要有两个有数据的版本才能对比</EmptyState> : (
        <CompareGrid fromLabel={fromLabel} toLabel={toLabel} rows={[
          compareRow("ctx", "每次请求的上下文", A?.avgContextTokens, B?.avgContextTokens, "lower", fmtTokens, relative),
          compareRow("overhead", "Harness 固定开销", A?.fixedOverheadTokens, B?.fixedOverheadTokens, "lower", fmtTokens, relative),
          compareRow("cache", "缓存被打断", A?.cacheBrokenRate, B?.cacheBrokenRate, "lower", (v) => fmtPct(v), (a, b) => fmtPoints(b - a)),
          compareRow("failure", "工具失败率", A?.toolFailureRate, B?.toolFailureRate, "lower", (v) => fmtPct(v), (a, b) => fmtPoints(b - a)),
          compareRow("repeat", "重复调用", A?.repeatRate, B?.repeatRate, "lower", (v) => fmtPct(v), (a, b) => fmtPoints(b - a)),
          compareRow("reread", "压缩后重读率", A?.rereadRate, B?.rereadRate, "lower", (v) => fmtPct(v, 0), (a, b) => fmtPoints(b - a, 0)),
          compareRow("active", "读取命中活跃", A?.activeHitRate, B?.activeHitRate, "higher", (v) => fmtPct(v, 0), (a, b) => fmtPoints(b - a, 0)),
          compareRow("plugins", "插件数", A?.plugins, B?.plugins, "none", fmtInt, (a, b) => fmtSignedInt(b - a)),
        ]} />
      )}
    </StatsCard>
  );
}
