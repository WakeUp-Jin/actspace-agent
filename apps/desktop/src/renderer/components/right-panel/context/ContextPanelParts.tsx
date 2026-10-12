import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "../../ui/cn";
import { Button } from "../../ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/Tooltip";

/** Context 面板各区块共用的外观；视觉对照 `docs/design-docs/frontend/context-panel-demo.html`。 */

export const CARD_CLASS = "rounded-act-group border border-line bg-surface";
export const CARD_HEAD_CLASS = "flex items-center gap-2 px-3 pt-2.5";
export const CARD_TITLE_CLASS = "text-act-sm font-semibold text-text-main";
export const CARD_META_CLASS = "ml-auto min-w-0 truncate text-act-xxs text-text-faint";
/** 原生列表行按钮的焦点框：画在行内侧，避免被卡片裁掉。 */
export const ROW_FOCUS_CLASS = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
export const TRACK_CLASS = "bg-[var(--act-color-meter-track)]";
/** 条目行里的类型 / 来源标签。 */
export const KIND_CHIP_CLASS = "shrink-0 whitespace-nowrap rounded-act-xs border border-line px-1.5 text-act-xxs leading-4 text-text-muted";
export const ITEM_TITLE_CLASS = "min-w-0 flex-1 truncate text-act-xs text-text-main";
export const ITEM_TOKENS_CLASS = "w-11 shrink-0 text-right text-act-xs tabular-nums text-text-muted";
/** 可多选的筛选 chip，按下态用 aria-pressed。 */
export const FILTER_CHIP_CLASS =
  "rounded-act-pill border border-line bg-transparent px-2 py-px text-act-xxs text-text-muted [cursor:pointer] hover:border-line-strong " +
  "aria-pressed:border-action aria-pressed:bg-action aria-pressed:text-on-action";
/** 列表首屏条数与每次「再显示」的条数。 */
export const INITIAL_ROW_LIMIT = 12;
export const ROW_LIMIT_STEP = 20;

export function colorOf(colorVar: string): string {
  return `var(${colorVar})`;
}

export function Swatch({ colorVar }: { colorVar: string }) {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-xs" style={{ background: colorOf(colorVar) }} />;
}

export type DeltaTone = "up" | "down" | "new" | "removed";

const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  up: "bg-success-soft text-success",
  down: "bg-danger-soft text-danger",
  new: "bg-info-soft text-info",
  removed: "bg-danger-soft text-danger",
};

export function DeltaBadge({ tone, children }: { tone: DeltaTone; children: ReactNode }) {
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-act-xs px-1.5 text-act-xxs font-semibold leading-[17px] tabular-nums", DELTA_TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

/** 单条占本类的小进度条；过小的条目也保留 4% 的可见宽度。 */
export function Gauge({ share, colorVar, label }: { share: number; colorVar: string; label: string }) {
  return (
    <span className={cn("h-[3px] w-9 shrink-0 overflow-hidden rounded-full", TRACK_CLASS)} title={label}>
      <i className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, share * 100))}%`, background: colorOf(colorVar) }} />
    </span>
  );
}

/** 指标旁的 `?`：悬停或聚焦时说明口径。 */
export function HelpHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={text}
          className="inline-grid cursor-help place-items-center rounded-full text-text-faint outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <CircleHelp size={12} strokeWidth={2} aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function ShowMoreButton({ hidden, total, onClick }: { hidden: number; total: number; onClick: () => void }) {
  if (hidden <= 0) return null;
  return (
    <Button variant="ghost" size="xs" className="ml-6 mt-1" onClick={onClick}>
      再显示 {Math.min(ROW_LIMIT_STEP, hidden)} 项（共 {total}）
    </Button>
  );
}
