import { useState, type RefObject } from "react";
import { Eye, X } from "lucide-react";
import type { ContextState, ContextUsageSnapshot } from "@actspace/shared";
import { getContextBucketDisplay } from "@actspace/shared";
import { contextBucketLabel } from "../context-labels";
import { formatApproxTokens, formatShare, formatTokenCount } from "../context-format";
import { selectRequestContextEstimate } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalSessionProjection } from "../session";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

const CONTEXT_POPOVER_GAP_PX = 10;
const CONTEXT_POPOVER_CLASS = "context-popover w-(--radix-popper-anchor-width) px-3.5 pb-3.5 pt-[13px]";
const CONTEXT_ROW_CLASS = "flex items-center justify-between gap-3.5";
const CONTEXT_CLOSE_CLASS =
  "grid h-6 w-6 place-items-center rounded-full border-0 bg-surface-subtle text-text-muted transition-colors hover:bg-[var(--act-color-hover-overlay)]";
const CONTEXT_SUMMARY_CLASS = `${CONTEXT_ROW_CLASS} py-3 pb-2 text-act-md leading-5 text-text-muted`;
const CONTEXT_METER_CLASS =
  "context-meter flex h-1.5 overflow-hidden rounded-full bg-[var(--act-color-meter-track)]";
const CONTEXT_BUCKETS_CLASS = "context-buckets grid gap-1 py-3 pb-1";
const CONTEXT_BUCKET_CLASS =
  "context-bucket grid grid-cols-[14px_minmax(0,1fr)_auto_36px] items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-act-md leading-5 text-text-main transition-colors";
const BUCKET_SWATCH_CLASS = "bucket-swatch h-[13px] w-[13px] rounded-[3px]";
const CONTEXT_BUCKET_VALUE_CLASS = "font-semibold text-text-main";

/**
 * Composer 上方的上下文用量浮层，和 Composer 等宽。点 Composer 自身不关闭（开关按钮在 Composer 里），
 * 点其他地方、Esc、关闭按钮关闭。
 */
export function ContextPopup({
  anchorRef,
  snapshot,
  contextState,
  onClose,
  onExpand
}: {
  /** Composer 外框：浮层贴在它上方、与它同宽。 */
  anchorRef: RefObject<HTMLElement | null>;
  snapshot: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  onClose: () => void;
  /** 提供时在 ✕ 旁显示「展开完整视图」按钮，点击在右侧面板打开 Context Tab。 */
  onExpand?: () => void;
}) {
  const sessionProjection = useOptionalSessionProjection();
  const projectionCell = sessionProjection?.cell ?? null;
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const projectedSnapshot = projectedContextEstimate ? contextEstimateToSnapshot(projectedContextEstimate) : null;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const stateSnapshot = contextState ? {
    basis: contextState.basis,
    totalTokens: contextState.totalEstimatedTokens,
    maxTokens: contextState.maxTokens,
    percentUsed: contextState.percentUsed,
    compressionCount: projectionCell?.snapshot?.activity.compactionCount ?? snapshot?.compressionCount ?? 0,
    cumulativeTokens: snapshot?.cumulativeTokens,
    estimator: contextState.estimator,
    buckets: contextState.buckets,
  } satisfies ContextUsageSnapshot : null;
  const safeSnapshot =
    stateSnapshot ?? snapshot ?? projectedSnapshot ?? {
      totalTokens: 0,
      maxTokens: 0,
      percentUsed: 0,
      compressionCount: 0,
      cumulativeTokens: 0,
      buckets: []
    };

  const toggleSelected = (key: string) => {
    setSelectedKey((prev) => (prev === key ? null : key));
  };

  const percentLabel = formatShare(safeSnapshot.totalTokens, safeSnapshot.maxTokens);


  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverAnchor virtualRef={anchorRef as RefObject<HTMLElement>} />
      <PopoverContent
        className={CONTEXT_POPOVER_CLASS}
        aria-label="上下文用量"
        data-composer-floating=""
        side="top"
        align="start"
        sideOffset={CONTEXT_POPOVER_GAP_PX}
        avoidCollisions={false}
        radius="2xl"
        // 焦点放在浮层本身：落到第一个按钮上会立刻弹出它的 Tooltip。
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
        // 点浮层外任何地方都关闭；只放过圆环按钮本身，由它的 onClick 切换，免得先关掉又被重新打开。
        onInteractOutside={(event) => {
          if ((event.target as Element | null)?.closest?.("[data-context-usage-toggle]")) event.preventDefault();
        }}
      >
        <header className={`context-popover-header ${CONTEXT_ROW_CLASS}`}>
          <strong>上下文</strong>
          <div className="flex items-center gap-1.5">
            {onExpand ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={CONTEXT_CLOSE_CLASS}
                    type="button"
                    onClick={onExpand}
                    aria-label="查看完整上下文"
                  >
                    <Eye size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>查看完整上下文</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className={CONTEXT_CLOSE_CLASS} type="button" onClick={onClose} aria-label="关闭上下文">
                  <X size={15} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>关闭上下文用量</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <div className={CONTEXT_SUMMARY_CLASS}>
          <span>{percentLabel} 已用</span>
          <span>
            {formatApproxTokens(safeSnapshot.totalTokens)} / {safeSnapshot.maxTokens > 0 ? formatTokenCount(safeSnapshot.maxTokens) : "—"} Token
          </span>
        </div>
        <div className={CONTEXT_METER_CLASS}>
          {safeSnapshot.buckets.map((bucket) => {
            const key = bucket.key ?? bucket.name ?? "conversation";
            const display = getContextBucketDisplay(key);
            // 段宽相对「上下文总容量(maxTokens)」而非「已用总量」，未用部分留作灰色轨道。
            const width =
              safeSnapshot.maxTokens > 0 ? `${(bucket.tokens / safeSnapshot.maxTokens) * 100}%` : "0%";
            const dimmed = selectedKey !== null && selectedKey !== key;
            return (
              <button
                key={key}
                type="button"
                className="h-full border-0 p-0 transition-opacity"
                style={{
                  width,
                  background: `var(${display.colorVar})`,
                  opacity: dimmed ? 0.3 : 1
                }}
                aria-pressed={selectedKey === key}
                aria-label={`${contextBucketLabel(key)} ${formatApproxTokens(bucket.tokens)} Token`}
                onClick={() => toggleSelected(key)}
              />
            );
          })}
        </div>
        <div className={CONTEXT_BUCKETS_CLASS}>
          {safeSnapshot.buckets.map((bucket) => {
            const key = bucket.key ?? bucket.name ?? "conversation";
            const display = getContextBucketDisplay(key);
            const selected = selectedKey === key;
            const dimmed = selectedKey !== null && !selected;
            return (
              <button
                type="button"
                className={`${CONTEXT_BUCKET_CLASS} ${selected ? "bg-[var(--act-color-hover-overlay)]" : "hover:bg-[var(--act-color-hover-overlay)]"}`}
                style={{ opacity: dimmed ? 0.45 : 1 }}
                key={key}
                aria-pressed={selected}
                onClick={() => toggleSelected(key)}
              >
                <span className={BUCKET_SWATCH_CLASS} style={{ background: `var(${display.colorVar})` }} />
                <span className="truncate">{contextBucketLabel(key)}</span>
                <strong className={CONTEXT_BUCKET_VALUE_CLASS}>{formatApproxTokens(bucket.tokens)}</strong>
                <span className="text-right text-act-xs tabular-nums text-text-faint">{formatShare(bucket.tokens, safeSnapshot.totalTokens)}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
