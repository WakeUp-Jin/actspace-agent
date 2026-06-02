import { useState } from "react";
import { Eye, X } from "lucide-react";
import type { ContextUsageSnapshot } from "@actspace/shared";
import { getContextBucketDisplay } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

const CONTEXT_POPOVER_CLASS =
  "context-popover absolute bottom-[calc(100%_+_10px)] right-0 z-20 w-[min(820px,100%)] rounded-2xl border border-line bg-surface-raised px-3.5 pb-3.5 pt-[13px] text-text-main shadow-act-popover";
const CONTEXT_ROW_CLASS = "flex items-center justify-between gap-3.5";
const CONTEXT_CLOSE_CLASS =
  "grid h-6 w-6 place-items-center rounded-full border-0 bg-surface-subtle text-text-muted transition-colors hover:bg-[var(--act-color-hover-overlay)]";
const CONTEXT_SUMMARY_CLASS = `${CONTEXT_ROW_CLASS} py-3 pb-2 text-sm text-text-muted`;
const CONTEXT_METER_CLASS =
  "context-meter flex h-1.5 overflow-hidden rounded-full bg-[var(--act-color-border-strong)]";
const CONTEXT_BUCKETS_CLASS = "context-buckets grid gap-1 py-3 pb-1";
const CONTEXT_BUCKET_CLASS =
  "context-bucket grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-sm text-text-main transition-colors";
const BUCKET_SWATCH_CLASS = "bucket-swatch h-[13px] w-[13px] rounded-[3px]";
const CONTEXT_BUCKET_VALUE_CLASS = "font-semibold text-text-main";

export function ContextPopup({
  snapshot,
  onClose,
  onExpand
}: {
  snapshot: ContextUsageSnapshot | null;
  onClose: () => void;
  /** 提供时在 ✕ 旁显示「展开完整视图」按钮，点击在右侧面板打开 Context Tab。 */
  onExpand?: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const safeSnapshot =
    snapshot ?? {
      totalTokens: 0,
      maxTokens: 200_000,
      percentUsed: 0,
      compressionCount: 0,
      cumulativeTokens: 0,
      buckets: []
    };

  const toggleSelected = (key: string) => {
    setSelectedKey((prev) => (prev === key ? null : key));
  };

  // 有内容但占比不足 1% 时显示「<1」，避免「明明有数据却是 0%」的误解。
  const percentLabel =
    safeSnapshot.totalTokens > 0 && safeSnapshot.percentUsed <= 0
      ? "<1"
      : `${safeSnapshot.percentUsed}`;

  return (
    <div className={CONTEXT_POPOVER_CLASS} role="dialog" aria-label="Context usage">
      <header className={`context-popover-header ${CONTEXT_ROW_CLASS}`}>
        <strong>Context</strong>
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
              <button className={CONTEXT_CLOSE_CLASS} type="button" onClick={onClose} aria-label="Close context">
                <X size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>关闭上下文用量</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <div className={CONTEXT_SUMMARY_CLASS}>
        <span>{percentLabel}% Full</span>
        <span>
          ~{safeSnapshot.totalTokens.toLocaleString()} / {safeSnapshot.maxTokens.toLocaleString()} Tokens
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
              aria-label={`${display.label} ${bucket.tokens.toLocaleString()} tokens`}
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
              <span className="truncate">{display.label}</span>
              <strong className={CONTEXT_BUCKET_VALUE_CLASS}>{bucket.tokens.toLocaleString()}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}
