import { useMemo, type CSSProperties } from "react";
import { HARNESS_FLAG_RULES, type HarnessDailyCount, type HarnessToolRow } from "@actspace/shared";
import { cn } from "../ui/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { linePoints, linearTicks, placeLabels } from "./harness-stats-chart-model";
import { callRate, fmtInt, fmtPct, fmtShortDay, fmtTokens, type BucketSegment } from "./harness-stats-format";

/*
 * 全部手写 SVG / HTML，不引入图表库。每个图形元素都有悬停提示；
 * 数值标签用文字色，系列色只用于图形本身（线、点、条、色块）。
 */

const TIP_CLASS = "whitespace-pre-line";

function Hint({ text, children }: { text: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className={TIP_CLASS}>{text}</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------ 6 类堆叠条 */

export function StackBar({ segments, label }: { segments: readonly BucketSegment[]; label: string }) {
  if (segments.length === 0) return <p className="m-0 text-act-sm text-text-faint">还没有上下文数据</p>;
  return (
    <div>
      <div role="img" aria-label={label} className="flex h-2.5 gap-0.5 overflow-hidden rounded-act-xs">
        {segments.map((segment) => (
          <Hint key={segment.key} text={`${segment.label}\n平均 ${fmtInt(segment.tokens)} token · ${fmtPct(segment.share)}`}>
            <span className="block h-full min-w-0.5" style={{ flex: segment.tokens, background: `var(${segment.colorVar})` } as CSSProperties} />
          </Hint>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-act-xs text-text-muted">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2 rounded-act-xs" style={{ background: `var(${segment.colorVar})` }} />
            {segment.label}
            <span className="tabular-nums text-text-main">{fmtTokens(segment.tokens)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 直方图 */

export function Histogram({
  values,
  labels,
  warnIndexes = [],
  tooltip,
  label,
}: {
  values: readonly number[];
  labels: readonly string[];
  warnIndexes?: readonly number[];
  tooltip: (index: number, value: number) => string;
  label: string;
}) {
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return <p className="m-0 py-6 text-center text-act-sm text-text-faint">所选范围内没有数据</p>;
  const middle = labels[Math.floor((labels.length - 1) / 2)];
  return (
    <div>
      <div role="img" aria-label={label} className="flex h-[72px] items-end gap-0.5">
        {values.map((value, index) => (
          <Hint key={index} text={tooltip(index, value)}>
            <span
              className={cn("block min-h-0.5 flex-1 rounded-t-act-xs opacity-70 hover:opacity-100", warnIndexes.includes(index) ? "bg-warning opacity-100" : "bg-text-main")}
              style={{ height: `${(value / max) * 100}%` }}
            />
          </Hint>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-act-xxs text-text-faint">
        <span>{labels[0]}</span>
        <span>{middle}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 每天趋势 */

const TREND_W = 840;

export function TrendChart({ data, unit, label, height = 132 }: { data: readonly HarnessDailyCount[]; unit: string; label: string; height?: number }) {
  const values = data.map((item) => item.value);
  const max = Math.max(1, ...values) * 1.1;
  const box = { left: 4, right: TREND_W - 4, top: 8, bottom: height - 20 };
  const points = useMemo(() => linePoints(values, box, max), [values, max, box.bottom]);
  if (data.length === 0) return <p className="m-0 py-6 text-center text-act-sm text-text-faint">所选范围内没有数据</p>;
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("");
  const area = `${line}L${points[points.length - 1]!.x},${box.bottom}L${points[0]!.x},${box.bottom}Z`;
  const slot = points.length > 1 ? (box.right - box.left) / (points.length - 1) : 40;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${TREND_W} ${height}`} className="block w-full overflow-visible">
      {[0, 0.5, 1].map((fraction) => {
        const y = box.bottom - fraction * (box.bottom - box.top);
        return <line key={fraction} x1={0} x2={TREND_W} y1={y} y2={y} className="stroke-line" strokeWidth={1} />;
      })}
      <path d={area} className="fill-text-main/6" />
      <path d={line} className="fill-none stroke-text-main/80" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((item, index) => {
        const point = points[index]!;
        return (
          <g key={item.day} className="group">
            <circle cx={point.x} cy={point.y} r={3.5} className="fill-text-main stroke-surface opacity-0 group-hover:opacity-100" strokeWidth={2} />
            <Hint text={`${item.day}\n${fmtInt(item.value)} ${unit}`}>
              <rect x={point.x - slot / 2} y={0} width={Math.max(slot, 8)} height={height} className="fill-transparent" />
            </Hint>
          </g>
        );
      })}
      <text x={0} y={height - 4} className="fill-text-faint text-act-xxs">{fmtShortDay(data[0]!.day)}</text>
      <text x={TREND_W} y={height - 4} textAnchor="end" className="fill-text-faint text-act-xxs">{fmtShortDay(data[data.length - 1]!.day)}</text>
    </svg>
  );
}

/* ------------------------------------------------------------ 成本 vs 使用 散点 */

const SCATTER = { w: 840, h: 300, left: 48, right: 16, top: 12, bottom: 32, xMinExp: -4 } as const;

export function CostScatter({ tools }: { tools: readonly HarnessToolRow[] }) {
  const rule = HARNESS_FLAG_RULES.toolCostlyUnused;
  const plotted = useMemo(
    () => tools
      .filter((tool): tool is HarnessToolRow & { schemaTokens: number } => tool.schemaTokens != null && tool.exposures > 0)
      .map((tool) => ({ tool, rate: callRate(tool.calls, tool.exposures) ?? 0, schema: tool.schemaTokens })),
    [tools],
  );
  const yMax = useMemo(() => Math.max(...linearTicks(Math.max(100, ...plotted.map((item) => item.schema)) * 1.05), 1), [plotted]);
  const skipped = tools.length - plotted.length;
  if (plotted.length === 0) return <p className="m-0 py-8 text-center text-act-sm text-text-faint">没有可以画出的工具（缺少定义大小或出现次数）</p>;

  const { w, h, left, right, top, bottom, xMinExp } = SCATTER;
  const X = (rate: number) => left + ((Math.log10(Math.max(rate, 10 ** xMinExp)) - xMinExp) / -xMinExp) * (w - left - right);
  const Y = (tokens: number) => h - bottom - (tokens / yMax) * (h - bottom - top);
  const isWarn = (rate: number, schema: number) => rate < rule.maxCallRate && schema >= rule.minSchemaTokens;
  const coords = plotted.map((item) => ({ ...item, cx: X(item.rate), cy: Y(item.schema), warn: isWarn(item.rate, item.schema) }));
  const topByCalls = new Set([...coords].sort((a, b) => b.tool.calls - a.tool.calls).slice(0, 6).map((item) => item.tool.name));
  const labels = placeLabels(
    coords.filter((item) => item.warn || topByCalls.has(item.tool.name)).map((item) => ({ id: item.tool.name, x: item.cx, y: item.cy, priority: (item.warn ? 1e9 : 0) + item.schema })),
    { width: w, height: h },
  );
  const warnNames = new Set(coords.filter((item) => item.warn).map((item) => item.tool.name));
  const xTicks = [10 ** -4, 10 ** -3, 10 ** -2, 10 ** -1, 1];
  const yTicks = linearTicks(yMax, 4);
  const zoneX = X(rule.maxCallRate);

  return (
    <div>
      <svg role="img" aria-label="工具成本与使用散点图：横轴调用率，纵轴工具定义 token" viewBox={`0 0 ${w} ${h}`} className="block w-full overflow-visible">
        <rect x={left} y={top} width={zoneX - left} height={Y(rule.minSchemaTokens) - top} className="fill-warning-soft" opacity={0.6} />
        <text x={zoneX - 8} y={top + 16} textAnchor="end" className="fill-text-main text-act-xxs font-medium">高占用 · 低使用</text>
        {xTicks.map((tick) => (
          <g key={tick}>
            <line x1={X(tick)} x2={X(tick)} y1={top} y2={h - bottom} className="stroke-line" strokeWidth={1} />
            <text x={X(tick)} y={h - bottom + 15} textAnchor={tick === 1 ? "end" : tick === 10 ** -4 ? "start" : "middle"} className="fill-text-faint text-act-xxs">{tick < 0.001 ? "≤0.01%" : fmtPct(tick, tick < 0.01 ? 1 : 0)}</text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={w - right} y1={Y(tick)} y2={Y(tick)} className="stroke-line" strokeWidth={1} />
            <text x={left - 6} y={Y(tick) + 3} textAnchor="end" className="fill-text-faint text-act-xxs">{fmtInt(tick)}</text>
          </g>
        ))}
        {coords.map((item) => (
          <Hint
            key={item.tool.name}
            text={`${item.tool.name}\n调用率 ${fmtPct(item.rate, 2)}（${fmtInt(item.tool.calls)} / ${fmtInt(item.tool.exposures)}）\n定义 ${fmtInt(item.schema)} token`}
          >
            <circle cx={item.cx} cy={item.cy} r={5} strokeWidth={2} className={cn("stroke-surface", item.warn ? "fill-warning" : "fill-text-main/75")} />
          </Hint>
        ))}
        {labels.map((item) => (
          <text key={item.id} x={item.x} y={item.y} textAnchor={item.anchor} className={cn("pointer-events-none text-act-xxs", warnNames.has(item.id) ? "fill-text-main font-medium" : "fill-text-muted")}>{item.id}</text>
        ))}
        <text x={w - right} y={h - 2} textAnchor="end" className="fill-text-faint text-act-xxs">调用率 →</text>
        <text x={left + 4} y={top - 1} className="fill-text-faint text-act-xxs">↑ 工具定义 token</text>
      </svg>
      {skipped > 0 ? <p className="m-0 mt-1 text-act-xxs text-text-faint">另有 {skipped} 个工具没有定义大小或出现次数，未画出，见下表。</p> : null}
    </div>
  );
}
