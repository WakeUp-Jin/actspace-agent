import { MessageSquarePlus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { COMPOSER_REFERENCE_LIMITS, codePointLength, type ResponseAnnotationReference } from "@actspace/shared";
import { Button } from "../ui/Button";
import { collectAnnotatableText, createAnnotationDraft, rangeToOffsets } from "./response-annotation-text";

type MenuState = {
  draft: ResponseAnnotationReference;
  /** 选区最后一行的矩形：菜单挂在它右下方。 */
  anchor: { top: number; bottom: number; right: number };
};

const MENU_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 12;
const MENU_CLASS =
  "fixed z-(--act-z-popover) min-w-40 rounded-act-md border border-line bg-surface-raised p-1 shadow-act-popover animate-[annotation-pop-in_120ms_ease-out_both] motion-reduce:animate-none";

function closestReply(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>("[data-assistant-message-id]") ?? null;
}

function lastLineRect(range: Range): DOMRect {
  const rects = typeof range.getClientRects === "function" ? Array.from(range.getClientRects()).filter((rect) => rect.width > 0) : [];
  return rects[rects.length - 1] ?? range.getBoundingClientRect();
}

/** 当前选区能否批注：起终点在同一条可批注回复内、映射得到偏移、且不超长。 */
function readSelection(canAnnotate: (messageId: string) => boolean): MenuState | null {
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
  const rect = lastLineRect(range);
  return {
    draft: createAnnotationDraft(model, offsets.start, offsets.end, messageId),
    anchor: { top: rect.top, bottom: rect.bottom, right: rect.right },
  };
}

/**
 * 回复选区末尾的「添加到对话」菜单。整个会话只挂一个实例：
 * 拖选过程中不出现，松开鼠标或用键盘扩选后才评估；选区清空、Escape、滚动时关闭。
 */
export function ResponseSelectionMenu({
  scrollContainerRef,
  canAnnotate,
  onAddAnnotation,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
  canAnnotate: (messageId: string) => boolean;
  onAddAnnotation: (annotation: ResponseAnnotationReference) => void;
}) {
  const [state, setState] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    let dragging = false;
    const evaluate = () => {
      frame = null;
      setState(readSelection(canAnnotate));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(evaluate);
    };
    const close = () => setState(null);
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node | null)) return;
      dragging = true;
      close();
    };
    const handlePointerUp = () => {
      if (!dragging) return;
      dragging = false;
      schedule();
    };
    const handleSelectionChange = () => {
      if (dragging) return;
      // 选区清空立即关闭；键盘扩选等非拖选的变化合并到下一帧评估。
      if (document.getSelection()?.isCollapsed ?? true) close();
      else schedule();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const scroller = scrollContainerRef.current;
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("keydown", handleKeyDown);
    scroller?.addEventListener("scroll", close, { passive: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keydown", handleKeyDown);
      scroller?.removeEventListener("scroll", close);
    };
  }, [canAnnotate, scrollContainerRef]);

  // 先渲染再量尺寸：挂在选区最后一行右下方，下方放不下时翻到选区上方；水平方向限制在视口内。
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!state || !menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const below = state.anchor.bottom + MENU_GAP_PX;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN_PX;
    const top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN_PX, state.anchor.top - MENU_GAP_PX - height);
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN_PX - width;
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(state.anchor.right, maxLeft))}px`;
    menu.dataset.placement = fitsBelow ? "below" : "above";
  }, [state]);

  if (!state) return null;
  return createPortal(
    <div ref={menuRef} className={MENU_CLASS} role="menu" aria-label="回复选区操作">
      <Button
        className="w-full justify-start"
        variant="ghost"
        size="sm"
        role="menuitem"
        // 按下时不让按钮抢走焦点，否则原生选区会先被清掉。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onAddAnnotation(state.draft);
          document.getSelection()?.removeAllRanges();
          setState(null);
        }}
      >
        <MessageSquarePlus size={15} aria-hidden="true" />
        添加到对话
      </Button>
    </div>,
    document.body,
  );
}
