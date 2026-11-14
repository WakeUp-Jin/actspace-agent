import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Info, type LucideIcon } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/HoverCard";
import { PlainButton } from "../ui/PlainButton";
import { Button } from "../ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { cn } from "../ui/cn";
import { DASH, fmtInt, fmtPct } from "./stats-format";

/* 统计页共用骨架（front-统计页规范.md §1）：指标卡、卡片与 12 列网格、小 tab、环形图、柱状图、热力图、
   排行列表、悬停详情卡、可排序表格、三格数字、键值列表、胶囊。颜色只用主题 token。 */

// ---------------------------------------------------------------- 跳转与高亮

/** 指标卡 / 值得关注点击后滚到目标并短暂高亮。目标元素 id = `stats-${id}`。 */
export function useStatsJump(): { flashId: string | null; jump: (id: string) => void } {
  const [flashId, setFlashId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );
  const jump = useCallback((id: string) => {
    // 先让调用方的状态（切 tab、排序）渲染出来再滚动。
    window.requestAnimationFrame(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document
        .getElementById(`stats-${id}`)
        ?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
    setFlashId(id);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlashId(null), 1400);
  }, []);
  return { flashId, jump };
}

// ---------------------------------------------------------------- 指标卡

export type DeltaTone = "good" | "bad" | "flat";
const DELTA_CLASS: Record<DeltaTone, string> = {
  good: "text-operational",
  bad: "text-on-danger",
  flat: "text-text-faint",
};

export function MetricRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid grid-cols-5 gap-2.5 max-[1100px]:grid-cols-3 max-[600px]:grid-cols-2">
      {children}
    </section>
  );
}

/** 副行在「 · 」处断行，不把一个数字拆到两行。 */
function splitDetail(text: string): ReactNode {
  const parts = text.split(" · ");
  return parts.map((part, index) => (
    <span key={index} className="whitespace-nowrap">
      {part}
      {index < parts.length - 1 ? " · " : ""}
    </span>
  ));
}

export function MetricCard({
  label,
  value,
  detail,
  tip,
  delta,
  onClick,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** 标签后的 ⓘ 口径说明。 */
  tip?: string;
  /** 指标卡底部的「比上一版本」行。 */
  delta?: { tone: DeltaTone; text: string };
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-act-xs text-text-faint">
        {label}
        {tip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help text-text-subtle hover:text-text-main">
                <Info size={12} aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-normal">{tip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      {tip ? <span className="sr-only">（{tip}）</span> : null}
      <span className="mt-1 block truncate text-act-xl font-semibold leading-tight tracking-tight tabular-nums text-text-main">
        {value}
      </span>
      {detail ? (
        <span className="mt-0.5 block text-act-xxs leading-snug text-text-faint">
          {typeof detail === "string" ? splitDetail(detail) : detail}
        </span>
      ) : null}
      {delta ? (
        <span className={cn("mt-1 block truncate text-act-xxs font-medium", DELTA_CLASS[delta.tone])}>
          {delta.text}
        </span>
      ) : null}
    </>
  );
  const base = "block min-w-0 w-full rounded-act-lg border border-line bg-surface px-3.5 pb-3 pt-3";
  return onClick ? (
    <PlainButton
      onClick={onClick}
      className={cn(base, "transition-colors duration-(--motion-fast) hover:border-line-strong")}
    >
      {inner}
    </PlainButton>
  ) : (
    <div className={base}>{inner}</div>
  );
}

// ---------------------------------------------------------------- 卡片与网格

export type CardSpan = 3 | 4 | 6 | 8 | 12;
// 按卡片网格自身宽度（容器查询）换列：< 640px c4 / c6 / c8 单列；c3 < 760px 两两一排，< 480px 单列。
const SPAN_CLASS: Record<CardSpan, string> = {
  3: "col-span-3 @max-[760px]:col-span-6 @max-[480px]:col-span-12",
  4: "col-span-4 @max-[640px]:col-span-12",
  6: "col-span-6 @max-[640px]:col-span-12",
  8: "col-span-8 @max-[640px]:col-span-12",
  12: "col-span-12",
};

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="@container grid grid-cols-12 gap-2.5">{children}</div>;
}

export function StatsCard({
  id,
  title,
  icon: Icon,
  aside,
  note,
  footer,
  span,
  flash,
  children,
  className,
}: {
  /** 跳转目标 id（元素 id = `stats-${id}`）。 */
  id?: string;
  title: string;
  icon?: LucideIcon;
  /** 卡头右侧：小 tab 或短计数。 */
  aside?: ReactNode;
  /** 卡头下方的一行灰字（例如「不受模型、提供商筛选影响」）。 */
  note?: ReactNode;
  footer?: ReactNode;
  span: CardSpan;
  flash?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id ? `stats-${id}` : undefined}
      aria-label={title}
      className={cn(
        "stats-card stats-jump-target flex min-w-0 flex-col rounded-act-lg border border-line bg-surface px-4 pb-4 pt-3.5",
        SPAN_CLASS[span],
        flash && "stats-flash",
        className,
      )}
    >
      <div className="mb-3 flex min-h-6 items-center gap-2">
        {Icon ? <Icon size={15} aria-hidden="true" className="shrink-0 text-text-faint" /> : null}
        <h3 className="m-0 whitespace-nowrap text-act-sm font-semibold text-text-main">{title}</h3>
        {aside ? (
          <div className="ml-auto flex min-w-0 items-center gap-1.5 whitespace-nowrap text-act-xs text-text-faint">
            {aside}
          </div>
        ) : null}
      </div>
      {note ? <p className="-mt-1.5 mb-2.5 text-act-xxs text-text-faint">{note}</p> : null}
      {children}
      {footer ? (
        <div className="mt-auto flex items-center gap-1.5 pt-2.5 text-act-xxs leading-relaxed text-text-faint">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** 底部明细区：下划线 tab + 表格；也是跳转目标。 */
export function DetailSection({ id, flash, children }: { id: string; flash?: boolean; children: ReactNode }) {
  return (
    <section
      id={`stats-${id}`}
      aria-label="明细"
      className={cn(
        "stats-jump-target flex min-w-0 flex-col gap-2.5 rounded-act-lg border border-transparent",
        flash && "stats-flash",
      )}
    >
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- 小 tab

export function SmallTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <span role="tablist" aria-label={ariaLabel} className="inline-flex gap-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PlainButton
            key={option.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-[22px] whitespace-nowrap rounded-act-sm px-2 text-act-xs transition-colors duration-(--motion-fast)",
              selected ? "bg-selected text-text-main" : "text-text-faint hover:text-text-main",
            )}
          >
            {option.label}
          </PlainButton>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------- 胶囊、三格、键值列表、空状态

export type PillTone = "neutral" | "ok" | "warn" | "err" | "info";
const PILL_CLASS: Record<PillTone, string> = {
  neutral: "bg-surface-subtle text-text-muted",
  ok: "bg-operational-soft text-operational",
  warn: "bg-warning-soft text-on-warning",
  err: "bg-danger-soft text-on-danger",
  info: "bg-info-soft text-on-info",
};

export function Pill({ tone = "neutral", children, title }: { tone?: PillTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[17px] shrink-0 items-center whitespace-nowrap rounded-act-xs px-1.5 text-act-3xs font-medium",
        PILL_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Stats3({ items }: { items: readonly { value: ReactNode; label: string; tip?: string }[] }) {
  return (
    <div className="mb-3 grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} title={item.tip} className="min-w-0 rounded-act-md bg-surface-subtle px-2.5 py-2">
          <b className="block whitespace-nowrap text-act-lg font-semibold tracking-tight tabular-nums text-text-main">
            {item.value}
          </b>
          <span className="block truncate text-act-xxs text-text-faint">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export type KvTone = "warn" | "bad" | "good";
const KV_TONE: Record<KvTone, string> = { warn: "text-on-warning", bad: "text-on-danger", good: "text-operational" };

export function KvList({
  rows,
}: {
  rows: readonly { label: ReactNode; value: ReactNode; tone?: KvTone; key?: string }[];
}) {
  return (
    <div className="flex flex-col">
      {rows.map((row, index) => (
        <div
          key={row.key ?? index}
          className="flex items-baseline gap-2.5 border-b border-line py-1.5 text-act-xs last:border-b-0"
        >
          <span className="min-w-0 text-text-muted">{row.label}</span>
          <span
            className={cn(
              "ml-auto whitespace-nowrap text-right tabular-nums text-text-main",
              row.tone && KV_TONE[row.tone],
            )}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-3 flex justify-between gap-2.5 text-act-xxs text-text-faint first:mt-0">
      <span>{children}</span>
      {aside ? <span className="tabular-nums">{aside}</span> : null}
    </div>
  );
}

export function EmptyState({ children = "这段时间没有数据" }: { children?: ReactNode }) {
  return <div className="py-5 text-center text-act-xs text-text-faint">{children}</div>;
}

// ---------------------------------------------------------------- 悬停详情卡

export type HoverDetail = {
  title: string;
  /** 标题用等宽字体（工具名、路径）。 */
  mono?: boolean;
  rows: readonly (readonly [label: string, value: ReactNode])[];
  total?: readonly [label: string, value: ReactNode];
  note?: ReactNode;
};

export function HoverDetailBody({ detail }: { detail: HoverDetail }) {
  return (
    <>
      <div className={cn("mb-1.5 truncate text-act-xs font-semibold", detail.mono && "font-mono")}>{detail.title}</div>
      <dl className="flex flex-col gap-0.5">
        {detail.rows.map(([label, value]) => (
          <DetailLine key={label} label={label} value={value} />
        ))}
      </dl>
      {detail.total ? (
        <dl className="mt-2 border-t border-line pt-2 font-medium">
          <DetailLine label={detail.total[0]} value={detail.total[1]} />
        </dl>
      ) : null}
      {detail.note ? <p className="mt-2 whitespace-normal text-act-xxs text-text-faint">{detail.note}</p> : null}
    </>
  );
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3.5">
      <dt className="whitespace-nowrap text-text-muted">{label}</dt>
      <dd className="m-0 whitespace-nowrap text-right tabular-nums">{value}</dd>
    </div>
  );
}

const HOVER_CARD_CLASS = "w-[216px] px-3 py-2.5";

/** 表格里可悬停的值：虚线下划线，悬停 / 聚焦 250ms 后出详情卡，离开 150ms 关闭，Esc 关闭。 */
export function HoverValue({
  detail,
  label,
  children,
  align = "end",
}: {
  detail: HoverDetail | null;
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  if (!detail) return <>{children}</>;
  return (
    <HoverCard openDelay={250} closeDelay={150}>
      <HoverCardTrigger asChild>
        <PlainButton aria-label={label} className="stats-hover-value rounded-act-xs text-inherit [text-align:inherit]">
          {children}
        </PlainButton>
      </HoverCardTrigger>
      <HoverCardContent role="region" aria-label={detail.title} align={align} className={HOVER_CARD_CLASS}>
        <HoverDetailBody detail={detail} />
      </HoverCardContent>
    </HoverCard>
  );
}

// ---------------------------------------------------------------- 排行列表

export type RankRow = {
  key: string;
  name: string;
  /** 进度条长度依据。 */
  value: number;
  /** 右侧数字，默认 `×次数`。 */
  countLabel?: ReactNode;
  sub?: ReactNode;
  /** 名称后的胶囊。 */
  tag?: ReactNode;
  /** 进度条颜色（CSS 颜色，必须是 token 变量），默认 tools 色。 */
  color?: string;
  detail?: HoverDetail;
};

/** 卡片内固定 336px 的滚动框（细滚动条、底部渐隐）。一张卡放多段列表时用它包住，列表传 `scroll={false}`。 */
export function StatsScroll({ children }: { children: ReactNode }) {
  return <div className="stats-scroll">{children}</div>;
}

/** 排行列表：全部列出，默认自带 336px 滚动框；悬停 / 聚焦一行 250ms 后出详情卡，任何滚动都关闭。 */
export function RankList({
  rows,
  ariaLabel,
  mono = true,
  color = "var(--act-context-tools)",
  empty,
  scroll = true,
}: {
  rows: readonly RankRow[];
  ariaLabel: string;
  mono?: boolean;
  color?: string;
  empty?: ReactNode;
  scroll?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEffect(() => {
    if (openKey == null) return;
    const close = () => setOpenKey(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [openKey]);
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  const list = (
    <ul aria-label={ariaLabel} className="m-0 flex list-none flex-col gap-0.5 p-0">
      {rows.map((row) => {
        const body = (
          <div
            tabIndex={row.detail ? 0 : undefined}
            className={cn(
              "-mx-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-[3px] rounded-act-sm px-1.5 pb-[5px] pt-1 text-act-xs outline-none",
              row.detail &&
                "hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:ring-2 focus-visible:ring-focus-ring",
              openKey === row.key && "bg-hover-overlay",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn("min-w-0 truncate text-text-main", mono && "font-mono")} title={row.name}>
                {row.name}
              </span>
              {row.tag}
            </span>
            <span className="whitespace-nowrap tabular-nums text-text-muted">
              {row.countLabel ?? `×${fmtInt(row.value)}`}
            </span>
            {row.sub ? (
              <span className="col-span-2 -mt-0.5 truncate text-act-xxs text-text-faint">{row.sub}</span>
            ) : null}
            <span
              aria-hidden="true"
              className="col-span-2 h-[3px] overflow-hidden rounded-act-xs"
              style={{ background: "var(--act-color-meter-track)" }}
            >
              <span
                className="block h-full rounded-act-xs opacity-85"
                style={{ width: `${(row.value / max) * 100}%`, background: row.color ?? color }}
              />
            </span>
          </div>
        );
        return (
          <li key={row.key}>
            {row.detail ? (
              <HoverCard
                open={openKey === row.key}
                onOpenChange={(open) =>
                  setOpenKey((current) => (open ? row.key : current === row.key ? null : current))
                }
                openDelay={250}
                closeDelay={150}
              >
                <HoverCardTrigger asChild>{body}</HoverCardTrigger>
                <HoverCardContent
                  role="region"
                  aria-label={row.detail.title}
                  side="right"
                  align="start"
                  className={HOVER_CARD_CLASS}
                >
                  <HoverDetailBody detail={row.detail} />
                </HoverCardContent>
              </HoverCard>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
  return scroll ? <StatsScroll>{list}</StatsScroll> : list;
}

// ---------------------------------------------------------------- 图表悬停提示

function ChartTip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  // x / y 是相对容器的百分比；靠边时改成贴边对齐，避免溢出卡片。
  const translateX = x < 12 ? "0%" : x > 88 ? "-100%" : "-50%";
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-2 whitespace-pre-line rounded-act-sm bg-text-main px-2 py-1 text-act-xxs leading-normal text-app-bg shadow-act-popover"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${translateX}, calc(-100% - 6px))` }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- 环形图

export type DonutSegment = { key: string; label: string; value: number; color: string; valueLabel: string };

export function Donut({
  segments,
  centerValue,
  centerLabel,
  ariaLabel,
  selectedKey,
  onSelect,
}: {
  segments: readonly DonutSegment[];
  centerValue: ReactNode;
  centerLabel: string;
  ariaLabel: string;
  /** 点击图例行选中一个类别（Harness 上下文卡联动来源卡）。 */
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.filter((segment) => segment.value > 0).length > 1 ? 2.2 : 0;
  const share = (value: number) => (total > 0 ? value / total : null);
  let offset = 0;
  const highlighted = hover ?? (selectedKey ? segments.findIndex((segment) => segment.key === selectedKey) : -1);
  const active = highlighted >= 0 ? segments[highlighted] : undefined;
  if (segments.length === 0 || total <= 0) return <EmptyState />;
  return (
    <div
      className="flex items-center gap-5 max-[600px]:flex-col max-[600px]:items-stretch"
      onMouseLeave={() => setHover(null)}
    >
      <div className="relative size-[136px] shrink-0 max-[600px]:self-center">
        <svg
          viewBox="0 0 136 136"
          className="size-full -rotate-90"
          role="img"
          aria-label={`${ariaLabel}：${segments.map((segment) => `${segment.label} ${fmtPct(share(segment.value))}`).join("，")}`}
        >
          <circle
            cx="68"
            cy="68"
            r={radius}
            fill="none"
            strokeWidth="15"
            style={{ stroke: "var(--act-color-meter-track)" }}
          />
          {segments.map((segment, index) => {
            const length = (Math.max(0, segment.value) / total) * circumference;
            const dash = Math.max(length - gap, 0.6);
            const element =
              length > 0 ? (
                <circle
                  key={segment.key}
                  cx="68"
                  cy="68"
                  r={radius}
                  fill="none"
                  strokeWidth={highlighted === index ? 18 : 15}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  onMouseEnter={() => setHover(index)}
                  onClick={onSelect ? () => onSelect(segment.key) : undefined}
                  className={cn(
                    "transition-[opacity,stroke-width] duration-(--motion-fast)",
                    onSelect && "cursor-pointer",
                  )}
                  style={{ stroke: segment.color, opacity: highlighted >= 0 && highlighted !== index ? 0.28 : 1 }}
                />
              ) : null;
            offset += length;
            return element;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <b className="text-act-lg font-semibold tracking-tight tabular-nums text-text-main">
            {active ? fmtPct(share(active.value)) : centerValue}
          </b>
          <span className="max-w-[90px] truncate text-act-xxs text-text-faint">
            {active ? active.label : centerLabel}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {segments.map((segment, index) => {
          const content = (
            <>
              <i aria-hidden="true" className="block size-2 stats-swatch" style={{ background: segment.color }} />
              <span className="min-w-0 truncate">{segment.label}</span>
              <span
                className="min-w-0 truncate whitespace-nowrap text-right text-act-xs tabular-nums text-text-faint"
                title={segment.valueLabel}
              >
                {segment.valueLabel}
              </span>
              <span className="min-w-10 text-right font-medium tabular-nums">{fmtPct(share(segment.value))}</span>
            </>
          );
          const className = cn(
            "-mx-1 grid w-[calc(100%+8px)] grid-cols-[10px_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-2 rounded-act-xs border-b border-line px-1 py-[5px] text-act-xs text-text-main transition-opacity duration-(--motion-fast) last:border-b-0",
            highlighted >= 0 && highlighted !== index && "opacity-45",
            selectedKey === segment.key && "bg-hover-overlay",
          );
          return onSelect ? (
            <PlainButton
              key={segment.key}
              aria-pressed={selectedKey === segment.key}
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(segment.key)}
              className={cn(className, "hover:bg-hover-overlay")}
            >
              {content}
            </PlainButton>
          ) : (
            <div key={segment.key} onMouseEnter={() => setHover(index)} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 柱状图

export type BarDatum = { key: string; value: number; tip: string; color?: string };

export function BarChart({
  data,
  ariaLabel,
  xLabels,
  height = 128,
  color = "var(--act-color-info)",
}: {
  data: readonly BarDatum[];
  ariaLabel: string;
  /** 横轴标签（两端 + 中间若干），均匀分布。 */
  xLabels?: readonly string[];
  height?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((item) => item.value), 0);
  const hovered = hover != null ? data[hover] : undefined;
  return (
    <div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div
          role="img"
          aria-label={ariaLabel}
          className="flex items-end gap-[3px] border-b border-line pb-px"
          style={{ height }}
        >
          {data.map((item, index) => (
            <span
              key={item.key}
              onMouseEnter={() => setHover(index)}
              className={cn("relative block h-full min-w-0 flex-1")}
            >
              <span
                className="absolute inset-x-0 bottom-0 block min-h-px stats-bar transition-opacity duration-(--motion-fast)"
                style={{
                  height: max > 0 ? `${(item.value / max) * 100}%` : 0,
                  background: item.color ?? color,
                  opacity: hover === index ? 1 : 0.8,
                }}
              />
            </span>
          ))}
        </div>
        {hovered && hover != null && data.length > 0 ? (
          <ChartTip x={((hover + 0.5) / data.length) * 100} y={max > 0 ? 100 - (hovered.value / max) * 100 : 100}>
            {hovered.tip}
          </ChartTip>
        ) : null}
      </div>
      {xLabels && xLabels.length > 0 ? (
        <div className="mt-1.5 flex justify-between text-act-xxs text-text-faint">
          {xLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- 热力图

const pad2 = (value: number) => String(value).padStart(2, "0");
export const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** 14 周 × 7 天，列 = 周（周一开始），最后一列是本周；今天之后的格子不画。 */
export function Heatmap({
  values,
  unit,
  ariaLabel,
  formatValue = fmtInt,
  now = new Date(),
}: {
  /** 本机日期 `YYYY-MM-DD` → 数值。 */
  values: ReadonlyMap<string, number>;
  unit: string;
  formatValue?: (value: number) => string;
  ariaLabel: string;
  now?: Date;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = 14;
  const cells = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
    return Array.from({ length: weeks * 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = localDateKey(date);
      return { key, date, future: date.getTime() > today.getTime(), value: values.get(key) ?? 0 };
    });
  }, [now, values]);
  const max = Math.max(0, ...cells.map((cell) => cell.value));
  const level = (value: number) => (value <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)));
  const months = Array.from({ length: weeks }, (_, week) => {
    const first = cells[week * 7].date;
    const previous = week > 0 ? cells[(week - 1) * 7].date : null;
    return !previous || previous.getMonth() !== first.getMonth() ? `${first.getMonth() + 1}月` : "";
  });
  const hovered = hover != null ? cells[hover] : undefined;
  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div
          role="img"
          aria-label={ariaLabel}
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {cells.map((cell, index) => (
            <i
              key={cell.key}
              onMouseEnter={() => (cell.future ? setHover(null) : setHover(index))}
              className={cn(
                "block aspect-square min-w-0 stats-cell",
                cell.future ? "invisible" : `stats-heat-${level(cell.value)}`,
                hover === index && "outline outline-[1.5px] outline-offset-1 outline-text-main",
              )}
            />
          ))}
        </div>
        {hovered && hover != null ? (
          <ChartTip
            x={((Math.floor(hover / 7) + 0.5) / weeks) * 100}
            y={((hover % 7) / 7) * 100}
          >{`${hovered.date.getMonth() + 1}月${hovered.date.getDate()}日\n${formatValue(hovered.value)} ${unit}`}</ChartTip>
        ) : null}
      </div>
      <div
        className="mt-1.5 grid text-act-xxs text-text-faint"
        style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {months.map((label, index) => (
          <span key={index} className="whitespace-nowrap">
            {label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-act-xxs text-text-faint">
        少
        {[0, 1, 2, 3, 4].map((step) => (
          <i key={step} aria-hidden="true" className={cn("block size-2.5 stats-swatch", `stats-heat-${step}`)} />
        ))}
        多
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 可排序表格

export type SortDir = "asc" | "desc";
export type TableSort = { key: string; dir: SortDir };

export type TableColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
  /** 单元格内容，默认 `String(row[key])`。 */
  render: (row: T) => ReactNode;
  /** 排序依据；不给则这一列不能排序。null 排在最后。 */
  sortValue?: (row: T) => number | string | null;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  defaultSort,
  pageSize,
  empty,
  ariaLabel,
  footer,
}: {
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 受控排序（跳转时要指定排序）；不给就内部管理。 */
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  defaultSort?: TableSort;
  /** 前端分页；服务端分页由调用方在 footer 里放 Pager。 */
  pageSize?: number;
  empty?: ReactNode;
  ariaLabel: string;
  footer?: ReactNode;
}) {
  const [innerSort, setInnerSort] = useState<TableSort | undefined>(defaultSort);
  const [page, setPage] = useState(1);
  const current = sort ?? innerSort;
  const setSort = (next: TableSort) => {
    setPage(1);
    if (onSortChange) onSortChange(next);
    else setInnerSort(next);
  };
  const sorted = useMemo(() => {
    const column = current ? columns.find((item) => item.key === current.key) : undefined;
    if (!current || !column?.sortValue) return rows;
    const sign = current.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = column.sortValue!(a);
      const y = column.sortValue!(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return (
        (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "zh-CN")) * sign
      );
    });
  }, [columns, current, rows]);
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const pageNo = Math.min(page, pages);
  const visible = pageSize ? sorted.slice((pageNo - 1) * pageSize, pageNo * pageSize) : sorted;
  return (
    <>
      <div className="overflow-auto rounded-act-lg border border-line bg-surface">
        <table aria-label={ariaLabel} className="w-full min-w-[40rem] border-collapse text-act-xs">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = current?.key === column.key;
                const right = column.align === "right";
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "whitespace-nowrap border-b border-line p-0 font-medium text-text-faint",
                      right ? "text-right" : "text-left",
                      column.className,
                    )}
                  >
                    {column.sortValue ? (
                      <PlainButton
                        onClick={() =>
                          setSort({ key: column.key, dir: active && current.dir === "desc" ? "asc" : "desc" })
                        }
                        className={cn(
                          "inline-flex w-full items-center gap-0.5 px-3 py-[7px] hover:text-text-main",
                          right && "justify-end",
                          active && "text-text-main",
                        )}
                      >
                        {column.label}
                        {active ? (
                          current.dir === "asc" ? (
                            <ArrowUp size={11} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={11} aria-hidden="true" />
                          )
                        ) : null}
                      </PlainButton>
                    ) : (
                      <span className="block px-3 py-[7px]">{column.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState>{empty}</EmptyState>
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-hover-overlay [&:last-child>td]:border-b-0">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "max-w-[280px] truncate whitespace-nowrap border-b border-line px-3 py-2 text-text-main",
                        column.align === "right" && "text-right tabular-nums",
                        column.mono && "font-mono",
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 ? (
        <Pager page={pageNo} totalPages={pages} totalRows={sorted.length} onPageChange={setPage} />
      ) : null}
      {footer}
    </>
  );
}

export function Pager({
  page,
  totalPages,
  totalRows,
  onPageChange,
  busy,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  busy?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="分页" className="flex items-center justify-end gap-2 text-act-xs text-text-faint">
      <span className="tabular-nums">
        第 {page} / {totalPages} 页 · 共 {fmtInt(totalRows)} 条
      </span>
      <Button size="xs" disabled={page <= 1 || busy} onClick={() => onPageChange(page - 1)}>
        上一页
      </Button>
      <Button size="xs" disabled={page >= totalPages || busy} onClick={() => onPageChange(page + 1)}>
        下一页
      </Button>
    </nav>
  );
}

export { DASH };
