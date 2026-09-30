import { useRef, useState, type CSSProperties } from "react";
import type { ResponseAnnotationReference } from "@actspace/shared";
import { Button } from "../ui/Button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/HoverCard";
import type { SentResponseAnnotation } from "./response-annotation-context";

const MARKER_CLASS =
  "pointer-events-auto absolute grid h-4 min-w-4 place-items-center rounded-act-pill border border-line bg-surface-raised px-1 text-act-xxs font-medium leading-none text-text-muted transition-[border-color,background-color,color] duration-(--motion-fast) hover:border-line-strong hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring aria-pressed:border-line-strong aria-pressed:bg-surface-subtle aria-pressed:text-text-main";
const SECTION_LABEL_CLASS = "text-act-xxs font-medium text-text-faint";
const EXCERPT_CLASS = "mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-line pl-2 text-text-main";

/** 回复上的一个编号 marker：悬停或键盘聚焦时预览原文和评论，Tab 进入卡片里的「复制到草稿」。 */
export function ResponseAnnotationPopover({
  item,
  active,
  style,
  onSelect,
  onCopyToDraft,
}: {
  item: SentResponseAnnotation;
  active: boolean;
  style: CSSProperties;
  onSelect: () => void;
  onCopyToDraft: (annotation: ResponseAnnotationReference) => void;
}) {
  const { annotation, label } = item;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dismissedRef = useRef(false);

  return (
    <HoverCard
      open={open}
      openDelay={150}
      closeDelay={120}
      onOpenChange={(next) => {
        if (next && dismissedRef.current) return;
        // 焦点在卡片里时忽略 trigger 失焦带来的关闭；Escape 会先把焦点还给 marker。
        if (!next && contentRef.current?.contains(document.activeElement)) return;
        setOpen(next);
      }}
    >
      <HoverCardTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={MARKER_CLASS}
          style={style}
          aria-label={`回复批注 ${label}`}
          aria-pressed={active}
          onFocus={(event) => {
            // Returning focus after Escape must not reopen the preview.
            if (dismissedRef.current) event.preventDefault();
          }}
          onBlur={() => { dismissedRef.current = false; }}
          onPointerEnter={() => { dismissedRef.current = false; }}
          onClick={() => {
            dismissedRef.current = false;
            onSelect();
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.shiftKey || !open) return;
            const first = contentRef.current?.querySelector<HTMLElement>("button");
            if (!first) return;
            event.preventDefault();
            first.focus();
          }}
        >
          {label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        ref={contentRef}
        role="dialog"
        aria-label={`回复批注 ${label}`}
        className="w-72"
        onEscapeKeyDown={() => {
          dismissedRef.current = true;
          triggerRef.current?.focus();
          setOpen(false);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null) && event.relatedTarget !== triggerRef.current) setOpen(false);
        }}
      >
        <p className={SECTION_LABEL_CLASS}>选中文本</p>
        <blockquote className={EXCERPT_CLASS}>{annotation.selectedText}</blockquote>
        {annotation.comment ? (
          <>
            <p className={`${SECTION_LABEL_CLASS} mt-3`}>用户评论</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-text-main">{annotation.comment}</p>
          </>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              onCopyToDraft(annotation);
              setOpen(false);
            }}
          >
            复制到草稿
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
