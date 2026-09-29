import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { COMPOSER_REFERENCE_LIMITS, codePointLength, type ResponseAnnotationReference } from "@actspace/shared";
import { Button } from "../ui/Button";
import { collectAnnotatableText, createAnnotationDraft, rangeToOffsets } from "./response-annotation-text";

type ToolbarState = {
  draft: ResponseAnnotationReference;
  anchor: { top: number; bottom: number; centerX: number };
};

const TOOLBAR_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 12;
const TOOLBAR_CLASS =
  "fixed z-(--act-z-popover) rounded-act-md border border-line bg-surface-raised p-0.5 shadow-act-popover animate-[annotation-toolbar-in_120ms_ease-out_both] motion-reduce:animate-none";

function closestReply(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>("[data-assistant-message-id]") ?? null;
}

/** 当前选区能否批注：起终点在同一条可批注回复内、映射得到偏移、且不超长。 */
function readSelection(canAnnotate: (messageId: string) => boolean): ToolbarState | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const reply = closestReply(range.startContainer);
  if (!reply || reply !== closestReply(range.endContainer)) return null;
  const messageId = reply.dataset.assistantMessageId;
  if (!messageId || !canAnnotate(messageId)) return null;
  const root = reply.querySelector<HTMLElement>("[data-annotation-root]");
  if (!root) return null;
  const model = collectAnnotatableText(root);
  const offsets = rangeToOffsets(model, range, root);
  if (!offsets) return null;
  if (codePointLength(model.text.slice(offsets.start, offsets.end)) > COMPOSER_REFERENCE_LIMITS.maxSelectedTextCodePoints) return null;
  const rect = range.getBoundingClientRect();
  return {
    draft: createAnnotationDraft(model, offsets.start, offsets.end, messageId),
    anchor: { top: rect.top, bottom: rect.bottom, centerX: rect.left + rect.width / 2 },
  };
}

/** 回复选区上方的「添加到对话」。整个会话只挂一个实例，监听 document 的选区变化。 */
export function ResponseSelectionToolbar({
  scrollContainerRef,
  canAnnotate,
  onAddAnnotation,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
  canAnnotate: (messageId: string) => boolean;
  onAddAnnotation: (annotation: ResponseAnnotationReference) => void;
}) {
  const [state, setState] = useState<ToolbarState | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    const evaluate = () => {
      frame = null;
      setState(readSelection(canAnnotate));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(evaluate);
    };
    const close = () => setState(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const scroller = scrollContainerRef.current;
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("keydown", handleKeyDown);
    scroller?.addEventListener("scroll", close, { passive: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("keydown", handleKeyDown);
      scroller?.removeEventListener("scroll", close);
    };
  }, [canAnnotate, scrollContainerRef]);

  // 先渲染再量尺寸：优先放在选区上方，空间不够翻到下方；水平方向限制在视口内。
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!state || !toolbar) return;
    const { width, height } = toolbar.getBoundingClientRect();
    const above = state.anchor.top - TOOLBAR_GAP_PX - height;
    const top = above >= VIEWPORT_MARGIN_PX ? above : state.anchor.bottom + TOOLBAR_GAP_PX;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN_PX - width;
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(state.anchor.centerX - width / 2, maxLeft));
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
    toolbar.dataset.placement = above >= VIEWPORT_MARGIN_PX ? "above" : "below";
  }, [state]);

  if (!state) return null;
  return createPortal(
    <div ref={toolbarRef} className={TOOLBAR_CLASS} role="toolbar" aria-label="回复选区操作">
      <Button
        variant="ghost"
        size="sm"
        // 按下时不让按钮抢走焦点，否则原生选区会先被清掉。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onAddAnnotation(state.draft);
          document.getSelection()?.removeAllRanges();
          setState(null);
        }}
      >
        <Plus size={14} aria-hidden="true" />
        添加到对话
      </Button>
    </div>,
    document.body,
  );
}
