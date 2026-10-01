import { Check } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { COMPOSER_REFERENCE_LIMITS, codePointLength, type ResponseAnnotationReference } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { useResponseAnnotations } from "./response-annotation-context";

const POPOVER_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 12;
const INPUT_MAX_HEIGHT_PX = 96;
const POPOVER_CLASS =
  "fixed z-(--act-z-popover) w-[340px] max-w-[calc(100vw-24px)] rounded-act-lg border border-line bg-surface-raised py-1.5 pl-3 pr-1.5 shadow-act-popover animate-[annotation-pop-in_120ms_ease-out_both] motion-reduce:animate-none";
const INPUT_CLASS =
  "block max-h-24 min-h-7 w-full resize-none overflow-y-auto bg-transparent py-1 text-act-sm leading-5 text-text-main placeholder:text-text-faint focus:outline-none";

function lastLineRect(range: Range): DOMRect | null {
  const rects = typeof range.getClientRects === "function" ? Array.from(range.getClientRects()).filter((rect) => rect.width > 0) : [];
  return rects[rects.length - 1] ?? null;
}

/**
 * 选区旁的评论输入框：添加批注后、点回复里的编号圆点或卡片里的编辑时打开。
 * Enter / ✓ 保存（空内容即无评论），Esc 不改评论直接关闭，点外部保存已输入的内容。
 */
export function ResponseAnnotationCommentPopover({
  scrollContainerRef,
  onClose,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** 保存或取消后调用，用来把焦点还给 Composer。点外部关闭时不调用，不和用户新点的目标抢焦点。 */
  onClose?: () => void;
}) {
  const context = useResponseAnnotations();
  const editingId = context?.editingAnnotationId ?? null;
  const index = context?.drafts.findIndex((annotation) => annotation.annotationId === editingId) ?? -1;
  const draft = index >= 0 ? context!.drafts[index]! : null;
  if (!context || !draft) return null;
  return (
    <CommentPopover
      key={draft.annotationId}
      draft={draft}
      label={`第 ${index + 1} 条批注的评论`}
      scrollContainerRef={scrollContainerRef}
      resolveRange={context.resolveRange}
      onSave={(comment, refocus) => {
        context.updateComment(draft.annotationId, comment);
        context.setEditingAnnotationId(null);
        if (refocus) onClose?.();
      }}
      onCancel={() => {
        context.setEditingAnnotationId(null);
        onClose?.();
      }}
    />
  );
}

function CommentPopover({
  draft,
  label,
  scrollContainerRef,
  resolveRange,
  onSave,
  onCancel,
}: {
  draft: ResponseAnnotationReference;
  label: string;
  scrollContainerRef: RefObject<HTMLElement | null>;
  resolveRange: (annotation: ResponseAnnotationReference) => Range | null;
  onSave: (comment: string, refocus: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(draft.comment ?? "");
  const [anchored, setAnchored] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const tooLong = codePointLength(value) > COMPOSER_REFERENCE_LIMITS.maxCommentCodePoints;
  const tooLongRef = useRef(tooLong);
  tooLongRef.current = tooLong;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // 锚在原文最后一行下方；原文滚出消息区时隐藏但不关闭，滚回来接着编辑。
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    let frame: number | null = null;
    const place = () => {
      frame = null;
      const range = resolveRange(draft);
      const rect = range ? lastLineRect(range) : null;
      const viewport = scrollContainerRef.current?.getBoundingClientRect();
      const visible = rect !== null && (!viewport || (rect.bottom > viewport.top && rect.top < viewport.bottom));
      popover.style.visibility = visible ? "visible" : "hidden";
      setAnchored(rect !== null);
      if (!rect) return;
      const { width } = popover.getBoundingClientRect();
      const maxLeft = window.innerWidth - VIEWPORT_MARGIN_PX - width;
      popover.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left - 4, maxLeft))}px`;
      popover.style.top = `${rect.bottom + POPOVER_GAP_PX}px`;
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(place);
    };
    place();
    const scroller = scrollContainerRef.current;
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [draft, resolveRange, scrollContainerRef]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // 自动增高，最多约 4 行，再多内部滚动。
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [value]);

  // 点外部：保存已输入的内容（超长时不保存，原评论保留）。
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node | null)) return;
      if (tooLongRef.current) onSaveRef.current(draft.comment ?? "", false);
      else onSaveRef.current(valueRef.current.trim(), false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [draft.comment]);

  const submit = () => {
    if (!tooLong) onSave(value.trim(), true);
  };

  return createPortal(
    <div ref={popoverRef} className={POPOVER_CLASS} role="dialog" aria-label={label} data-anchored={anchored ? "true" : "false"}>
      <div className="flex items-end gap-1.5">
        <textarea
          ref={inputRef}
          className={INPUT_CLASS}
          aria-label={label}
          aria-invalid={tooLong}
          placeholder="添加评论（可选）…"
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // 只关闭评论框，不再往上关闭 Composer 的其他浮层。
              event.preventDefault();
              event.stopPropagation();
              onCancel();
              return;
            }
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            submit();
          }}
        />
        <IconButton label="保存评论" variant="primary" size="sm" shape="round" disabled={tooLong} onClick={submit}>
          <Check size={15} strokeWidth={2.4} aria-hidden="true" />
        </IconButton>
      </div>
      {tooLong ? (
        <p className="pb-1 pr-1.5 text-act-xs leading-4 text-danger" role="alert">
          评论超过 {COMPOSER_REFERENCE_LIMITS.maxCommentCodePoints.toLocaleString("en-US")} 个字符，请缩短后再提交。
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
