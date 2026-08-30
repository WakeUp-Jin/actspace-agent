import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

export type ConversationTurnNavigationItem = {
  id: string;
  input: string;
  reply: string | null;
  pending: boolean;
};

const RAIL_CLASS =
  "pointer-events-none absolute left-2 top-1/2 z-30 -translate-y-1/2";
const RAIL_STACK_CLASS = "flex flex-col gap-0.5";
const RAIL_STACK_DENSE_CLASS =
  "flex h-[min(260px,55vh)] flex-col";
const MARKER_BUTTON_CLASS =
  "group pointer-events-auto flex w-8 items-center border-0 bg-transparent pl-1 focus-visible:outline-none";
const MARKER_BUTTON_DEFAULT_CLASS = "h-3.5";
const MARKER_BUTTON_DENSE_CLASS = "min-h-[2px] flex-1";
const MARKER_CLASS =
  "h-[2px] rounded-act-pill bg-line-strong transition-[width,background-color] duration-[150ms] ease-out group-hover:bg-text-main group-focus-visible:bg-text-main motion-reduce:transition-none";
const MARKER_ACTIVE_CLASS = "bg-text-main";
const MARKER_RESTING_CLASS = "w-1.5";
const MARKER_ACTIVE_WIDTH_CLASS = "w-5";
const MARKER_WAVE_WIDTH_CLASSES = ["w-6", "w-5", "w-4", "w-3", "w-2"] as const;
const PREVIEW_CARD_CLASS =
  "w-[min(340px,calc(100vw-64px))] rounded-act-md border border-line bg-surface-raised px-3 py-2.5 text-left shadow-act-popover";
const PREVIEW_INPUT_CLASS =
  "line-clamp-2 whitespace-pre-wrap break-words text-[13px] font-semibold leading-[1.45] text-text-main";
const PREVIEW_REPLY_CLASS =
  "mt-2 border-t border-line pt-2 line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-[1.5] text-text-muted";

function previewLabel(item: ConversationTurnNavigationItem, index: number): string {
  const compactInput = item.input.replace(/\s+/g, " ").trim();
  const suffix = compactInput ? `：${compactInput.slice(0, 48)}` : "";
  return `跳到第 ${index + 1} 轮对话${suffix}`;
}

function markerWidthClass(index: number, waveCenterIndex: number | null, active: boolean): string {
  if (waveCenterIndex === null) return active ? MARKER_ACTIVE_WIDTH_CLASS : MARKER_RESTING_CLASS;
  const distance = Math.abs(index - waveCenterIndex);
  const waveWidth = MARKER_WAVE_WIDTH_CLASSES[distance] ?? MARKER_RESTING_CLASS;
  return active && distance > 1 ? MARKER_ACTIVE_WIDTH_CLASS : waveWidth;
}

export function ConversationTurnRail({
  items,
  activeTurnId,
  onNavigate,
}: {
  items: ConversationTurnNavigationItem[];
  activeTurnId: string | null;
  onNavigate: (turnId: string) => void;
}) {
  const dense = items.length > 14;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const waveCenterIndex = hoveredIndex ?? focusedIndex;

  return (
    <nav className={RAIL_CLASS} aria-label="会话轮次导航" onPointerLeave={() => setHoveredIndex(null)}>
      <div className={dense ? RAIL_STACK_DENSE_CLASS : RAIL_STACK_CLASS}>
        {items.map((item, index) => {
          const active = item.id === activeTurnId;
          const markerWidth = markerWidthClass(index, waveCenterIndex, active);
          return (
            <Tooltip key={item.id} delayDuration={120}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`${MARKER_BUTTON_CLASS} ${dense ? MARKER_BUTTON_DENSE_CLASS : MARKER_BUTTON_DEFAULT_CLASS}`}
                  aria-label={previewLabel(item, index)}
                  aria-current={active ? "location" : undefined}
                  onPointerEnter={() => setHoveredIndex(index)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className={`${MARKER_CLASS} ${markerWidth}${active ? ` ${MARKER_ACTIVE_CLASS}` : ""}`} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="center"
                sideOffset={8}
                collisionPadding={12}
                className="!max-w-none !select-text !border-0 !bg-transparent !p-0 !shadow-none"
              >
                <div className={PREVIEW_CARD_CLASS}>
                  <div className={PREVIEW_INPUT_CLASS}>{item.input}</div>
                  <div className={PREVIEW_REPLY_CLASS}>
                    {item.reply ?? (item.pending ? "正在执行…" : "本轮没有最终回复")}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
