import { ArrowDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

const BUTTON_CLASS =
  "grid h-9 w-9 place-items-center rounded-act-pill border border-line bg-surface-raised text-text-muted shadow-act-popover transition-[background-color,border-color,color,transform] duration-[150ms] ease-in-out hover:-translate-y-px hover:border-line-strong hover:bg-surface-subtle hover:text-text-main active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring motion-reduce:transform-none";

export function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
      <Tooltip delayDuration={120}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`${BUTTON_CLASS} pointer-events-auto`}
            aria-label="滚动到底部"
            onClick={onClick}
          >
            <ArrowDown size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">滚动到底部</TooltipContent>
      </Tooltip>
    </div>
  );
}
