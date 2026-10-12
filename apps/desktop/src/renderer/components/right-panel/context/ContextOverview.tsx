import type { ContextPanelView } from "@actspace/shared";
import { contextBucketLabel } from "../../../context-labels";
import { formatApproxTokens, formatShare, formatTokenCount } from "../../../context-format";
import { cn } from "../../ui/cn";
import type { ContextCategory } from "./context-panel-model";
import { CARD_CLASS, CARD_HEAD_CLASS, CARD_META_CLASS, CARD_TITLE_CLASS, ROW_FOCUS_CLASS, Swatch, TRACK_CLASS, colorOf } from "./ContextPanelParts";

/**
 * ① 当前上下文：已用 / 上限、按分类的分段条和自动压缩刻度、双列图例。
 * 点图例聚焦一个分类（再点取消），其他分类在分段条和明细里变淡。上限未知时分段条按已用总量缩放。
 */
export function ContextOverview({ view, categories, focus, onFocus }: {
  view: ContextPanelView;
  categories: readonly ContextCategory[];
  focus: string | null;
  onFocus: (key: string | null) => void;
}) {
  const total = view.current.totalEstimatedTokens;
  const contextWindow = view.model?.contextWindow ?? null;
  const scale = contextWindow ?? total;
  const threshold = contextWindow && view.model?.autoCompactAtTokens ? view.model.autoCompactAtTokens : null;
  const thresholdLeft = threshold && contextWindow ? Math.min(100, (threshold / contextWindow) * 100) : null;

  return (
    <section className={CARD_CLASS} aria-label="当前上下文">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>当前上下文</span>
        {view.model?.label ? <span className={CARD_META_CLASS}>{view.model.label}</span> : null}
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="flex items-baseline justify-between gap-2 tabular-nums">
          <span>
            <span className="text-act-xl font-semibold tracking-tight text-text-main">{formatApproxTokens(total)}</span>
            <span className="ml-0.5 text-act-xs text-text-faint">{contextWindow ? `/ ${formatTokenCount(contextWindow)} tokens` : "tokens"}</span>
          </span>
          {contextWindow ? (
            <span className="text-act-lg font-semibold text-text-main">
              {formatShare(total, contextWindow)}<small className="ml-1 text-act-xxs font-normal text-text-faint">已用</small>
            </span>
          ) : null}
        </div>
        <div className={cn("relative mb-1 mt-2 flex h-2.5 overflow-hidden rounded-act-xs", TRACK_CLASS)}>
          {categories.map((category, index) => (
            <span key={category.key}
              className={cn("h-full transition-opacity duration-(--motion-fast)", focus && focus !== category.key && "opacity-25")}
              style={{
                width: `${scale > 0 ? (category.totalTokens / scale) * 100 : 0}%`,
                background: colorOf(category.colorVar),
                boxShadow: index > 0 ? "inset 1px 0 0 var(--act-color-surface)" : undefined,
              }} />
          ))}
          {thresholdLeft !== null ? (
            <span aria-hidden="true" className="absolute inset-y-0 right-0"
              style={{ left: `${thresholdLeft}%`, background: "repeating-linear-gradient(-45deg, var(--act-color-warning-soft) 0 3px, transparent 3px 7px)" }} />
          ) : null}
        </div>
        <div className="relative h-3.5 text-act-xxs text-text-faint">
          {thresholdLeft !== null && threshold ? (
            <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap before:absolute before:-top-1.5 before:left-1/2 before:h-[5px] before:border-l before:border-dashed before:border-line-strong"
              style={{ left: `${thresholdLeft}%` }}>
              自动压缩 {formatApproxTokens(threshold)}
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3.5 gap-y-0.5">
          {categories.map((category) => (
            <button key={category.key} type="button" aria-pressed={focus === category.key}
              onClick={() => onFocus(focus === category.key ? null : category.key)}
              className={cn(
                "-mx-1 flex min-w-0 items-center gap-1.5 rounded-act-xs border-0 bg-transparent px-1 py-0.5 text-left text-act-xs text-text-main hover:bg-hover-overlay [cursor:pointer]",
                ROW_FOCUS_CLASS,
                focus && focus !== category.key && "opacity-45",
              )}>
              <Swatch colorVar={category.colorVar} />
              <span className="min-w-0 flex-1 truncate">{contextBucketLabel(category.key)}</span>
              <span className="tabular-nums text-text-muted">{formatApproxTokens(category.totalTokens)}</span>
              <span className="w-8 text-right tabular-nums text-text-faint">{formatShare(category.totalTokens, total)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
