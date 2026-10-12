import { useEffect, useRef, useState } from "react";
import type { ContextPanelTrendPoint } from "@actspace/shared";
import { formatApproxTokens, formatTokenCount } from "../../../context-format";
import { cn } from "../../ui/cn";
import { trendLayout } from "./context-panel-model";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_META_CLASS, CARD_TITLE_CLASS, colorOf } from "./ContextPanelParts";

/** 每根柱的最小占宽（含间距），放不下时横向滚动。 */
const COLUMN_PITCH_PX = 11;

/**
 * ④ 上下文趋势：每次请求一根柱，柱内按分类分段；压缩前画一条分隔并在轴上标出回收量。
 * 悬停的柱子在图表上方显示一行说明（不挂 Tooltip），没有悬停时说明的是最新一次请求。打开时滚到最右。
 */
export function ContextTrend({ points }: { points: readonly ContextPanelTrendPoint[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const columns = trendLayout(points);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, [points.length]);

  if (columns.length === 0) return null;
  const active = (columns[hovered ?? columns.length - 1] ?? columns.at(-1)!).point;
  const lastCompaction = [...columns].reverse().find((column) => column.compactedBefore)?.point.compactedBefore;

  return (
    <section className={CARD_CLASS} aria-label="上下文趋势">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>上下文趋势</span>
        <span className={CARD_META_CLASS}>每根柱 = 一次请求</span>
      </div>
      <div className="px-3 pb-3 pt-2">
        <p className="m-0 truncate pb-1.5 text-act-xxs tabular-nums text-text-muted" aria-live="polite">
          第 {active.turnIndex} 轮 · 步 {active.stepIndex} · {formatApproxTokens(active.estimatedTokens)}
          {active.actual ? ` · 实际输入 ${formatTokenCount(active.actual.inputTokens + active.actual.cacheReadTokens + active.actual.cacheWriteTokens)}` : ""}
        </p>
        <div ref={scrollRef} className="overflow-x-auto" onMouseLeave={() => setHovered(null)}>
          <div className="flex h-[92px] items-end gap-[3px] border-b border-line" style={{ minWidth: `${columns.length * COLUMN_PITCH_PX}px` }}>
            {columns.map((column, index) => (
              <div key={column.point.requestId} className="flex h-full min-w-0 flex-1 items-end gap-[3px]">
                {column.compactedBefore ? <span aria-hidden="true" className="h-full shrink-0 border-l border-dashed border-danger" /> : null}
                <div data-trend-column={index} onMouseEnter={() => setHovered(index)}
                  className={cn("flex min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-t-xs", hovered === index && "outline outline-1 outline-line-strong")}
                  style={{ height: `${Math.max(1, column.height * 100)}%` }}>
                  {column.segments.map((segment) => (
                    <i key={segment.key} className="block shrink-0" style={{ height: `${segment.share * 100}%`, background: colorOf(segment.colorVar) }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-[3px] flex justify-between gap-2 text-act-xxs tabular-nums text-text-faint">
          <span>#1</span>
          {lastCompaction ? <span className="text-danger">✂ 压缩{lastCompaction.reclaimedTokens === null ? "" : ` −${formatTokenCount(lastCompaction.reclaimedTokens)}`}</span> : null}
          <span>#{columns.length} 最新</span>
        </div>
      </div>
    </section>
  );
}
