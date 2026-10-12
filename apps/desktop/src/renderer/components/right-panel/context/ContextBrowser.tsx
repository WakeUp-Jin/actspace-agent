import { ContextEntryTextScope } from "./ContextEntryText";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ContextPanelView } from "@actspace/shared";
import { contextBucketLabel } from "../../../context-labels";
import { formatApproxTokens, formatShare, formatSignedTokens, formatTokenCount } from "../../../context-format";
import { cn } from "../../ui/cn";
import { Select } from "../../ui/Select";
import type { ContextCategory } from "./context-panel-model";
import { ContextConversationList } from "./ContextConversationList";
import { ContextEntryList } from "./ContextEntryList";
import { CARD_CLASS, CARD_TITLE_CLASS, DeltaBadge, ROW_FOCUS_CLASS, Swatch, TRACK_CLASS, colorOf } from "./ContextPanelParts";

/** 打开面板时默认展开的分类。 */
const DEFAULT_OPEN = ["tools", "conversation"];

/**
 * ③ 上下文明细：对比开关、估算 / 实际总量、迷你色条，以及按 registry 顺序的分类。
 * 对比基准是最近一次已发送的请求；还没有请求时开关禁用。
 */
export function ContextBrowser({ view, categories, compare, onCompareChange, focus }: {
  view: ContextPanelView;
  categories: readonly ContextCategory[];
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  focus: string | null;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(DEFAULT_OPEN));
  const total = view.current.totalEstimatedTokens;
  const previous = view.previous?.comparable === false ? null : view.previous;
  const actual = previousActualInput(view);
  const entryCount = categories.reduce((sum, category) => sum + category.entries.length, 0);
  const compareOptions = [
    { value: "previous", label: previous ? `最近请求输入（第 ${previous.turnIndex} 轮 · 步 ${previous.stepIndex}）` : "最近请求输入" },
    { value: "none", label: "不对比" },
  ];

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <ContextEntryTextScope.Provider value={{ sessionId: view.sessionId, revision: view.entriesPage?.revision }}><section className={CARD_CLASS} aria-label="上下文明细">
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-2.5">
        <span className={CARD_TITLE_CLASS}>上下文明细</span>
        <Select value={compare && previous ? "previous" : "none"} onValueChange={(value) => onCompareChange(value === "previous")}
          options={compareOptions} ariaLabel="对比基准" disabled={!previous} className="ml-auto max-w-full" />
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2 text-act-xxs text-text-faint">
        <span><b className="font-medium tabular-nums text-text-main">{formatApproxTokens(total)}</b> 估算</span>
        {actual !== null ? <span>· 最近请求实际 <b className="font-medium tabular-nums text-text-main">{formatTokenCount(actual)}</b>（服务商返回）</span> : null}
        <span className="ml-auto tabular-nums">{entryCount} 项</span>
      </div>
      {view.previous?.comparable === false ? <p className="px-3 text-act-xxs text-text-faint">这次请求没有可比较的来源清单，已停用逐项对比。</p> : null}
      <div className={cn("mx-3 mb-2.5 flex h-1 overflow-hidden rounded-full", TRACK_CLASS)}>
        {categories.map((category) => (
          <span key={category.key} style={{ width: `${total > 0 ? (category.totalTokens / total) * 100 : 0}%`, background: colorOf(category.colorVar) }} />
        ))}
      </div>
      {categories.map((category) => (
        <CategorySection key={category.key} category={category} grandTotal={total} open={open.has(category.key)}
          dimmed={focus !== null && focus !== category.key} onToggle={() => toggle(category.key)} />
      ))}
    </section></ContextEntryTextScope.Provider>
  );
}

function CategorySection({ category, grandTotal, open, dimmed, onToggle }: {
  category: ContextCategory;
  grandTotal: number;
  open: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-t border-line" data-category={category.key}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-[7px] border-0 bg-transparent px-3 py-2 text-left text-act-sm text-text-main [cursor:pointer] hover:bg-hover-overlay",
          ROW_FOCUS_CLASS,
          dimmed && "opacity-45",
        )}>
        <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true"
          className={cn("shrink-0 text-text-faint transition-transform duration-(--motion-fast)", open && "rotate-90")} />
        <Swatch colorVar={category.colorVar} />
        <span className="font-medium">{contextBucketLabel(category.key)}</span>
        <span className="text-act-xxs tabular-nums text-text-faint">{category.entries.length} 项</span>
        {category.itemDelta !== 0 ? (
          <DeltaBadge tone={category.itemDelta > 0 ? "up" : "down"}>{category.itemDelta > 0 ? "+" : "−"}{Math.abs(category.itemDelta)}</DeltaBadge>
        ) : null}
        <span className="flex-1" />
        {category.tokenDelta !== 0 ? (
          <DeltaBadge tone={category.tokenDelta > 0 ? "up" : "down"}>{formatSignedTokens(category.tokenDelta)}</DeltaBadge>
        ) : null}
        <span className="w-[50px] text-right text-act-xs tabular-nums text-text-muted">{formatApproxTokens(category.totalTokens)}</span>
        <span className="w-8 text-right text-act-xxs tabular-nums text-text-faint">{formatShare(category.totalTokens, grandTotal)}</span>
      </button>
      {open ? (
        category.key === "conversation"
          ? <ContextConversationList category={category} />
          : <ContextEntryList category={category} grandTotal={grandTotal} />
      ) : null}
    </div>
  );
}

/** 上次请求服务商返回的实际输入（未命中输入 + 缓存读写）；趋势里找不到这次请求时为 null。 */
function previousActualInput(view: ContextPanelView): number | null {
  if (!view.previous) return null;
  const point = view.trend.find((candidate) => candidate.requestId === view.previous!.requestId);
  if (!point?.actual) return null;
  return point.actual.inputTokens + point.actual.cacheReadTokens + point.actual.cacheWriteTokens;
}
