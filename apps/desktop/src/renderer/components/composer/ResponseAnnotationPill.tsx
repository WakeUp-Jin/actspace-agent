import { MessageSquareText, Pencil, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ResponseAnnotationReference } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/HoverCard";
import { useResponseAnnotations } from "../messages/response-annotation-context";

const PILL_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-act-pill border border-line bg-surface px-2.5 text-act-xs font-medium text-text-muted transition-colors duration-(--motion-fast) hover:border-line-strong hover:text-text-main aria-expanded:border-line-strong aria-expanded:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const ITEM_CLASS = "py-2.5 first:pt-0 last:pb-0 [&+&]:border-t [&+&]:border-line";
const SENT_ITEM_BUTTON_CLASS =
  "-mx-1.5 block w-[calc(100%+12px)] rounded-act-sm px-1.5 py-1 text-left transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const LABEL_CLASS = "text-act-xs leading-4 text-text-faint";
const TEXT_CLASS = "mt-0.5 block whitespace-pre-wrap break-words text-act-sm leading-5 text-text-main";

/**
 * 「N 条批注」胶囊：悬停或聚焦时弹出卡片，逐条显示选中文本和评论。
 * - draft：Composer 里的草稿，卡片条目有编辑 / 删除，胶囊右上角 × 清空全部。
 * - sent：用户消息上方的已发送批注，只读；点条目滚到原文，定位不上的显示「原回复不可用」。
 * 悬停 / 聚焦某一条时加深它的原文高亮。
 */
export function ResponseAnnotationPill({
  annotations,
  variant,
  onClear,
}: {
  annotations: readonly ResponseAnnotationReference[];
  variant: "draft" | "sent";
  onClear?: () => void;
}) {
  const context = useResponseAnnotations();
  const [open, setOpen] = useState(false);
  const [availableIds, setAvailableIds] = useState<ReadonlySet<string>>(() => new Set());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dismissedRef = useRef(false);

  if (annotations.length === 0) return null;
  const isDraft = variant === "draft";
  const label = `${annotations.length} 条批注`;

  const changeOpen = (next: boolean) => {
    if (next && dismissedRef.current) return;
    // 焦点在卡片里时忽略 trigger 失焦带来的关闭；Escape 会先把焦点还给胶囊。
    if (!next && contentRef.current?.contains(document.activeElement)) return;
    if (next && !isDraft && context) {
      // 已发送批注在卡片打开时解析一次：回复可能已不在已加载历史里。
      setAvailableIds(new Set(annotations.flatMap((annotation) => (context.resolveRange(annotation) ? [annotation.annotationId] : []))));
    }
    setOpen(next);
  };
  const close = () => {
    setOpen(false);
    context?.setActiveAnnotationId(null);
  };

  return (
    <span className="group relative inline-flex">
      <HoverCard open={open} openDelay={100} closeDelay={120} onOpenChange={changeOpen}>
        <HoverCardTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={PILL_CLASS}
            aria-haspopup="dialog"
            aria-expanded={open}
            onFocus={(event) => {
              // Escape 后把焦点还给胶囊时不重新打开。
              if (dismissedRef.current) event.preventDefault();
            }}
            onBlur={() => { dismissedRef.current = false; }}
            onPointerEnter={() => { dismissedRef.current = false; }}
            onClick={() => {
              dismissedRef.current = false;
              changeOpen(!open);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Tab" || event.shiftKey || !open) return;
              const first = contentRef.current?.querySelector<HTMLElement>("button");
              if (!first) return;
              event.preventDefault();
              first.focus();
            }}
          >
            <MessageSquareText size={14} aria-hidden="true" />
            {label}
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          ref={contentRef}
          role="dialog"
          aria-label={isDraft ? "草稿批注" : "已发送的批注"}
          side={isDraft ? "top" : "bottom"}
          align={isDraft ? "start" : "end"}
          className="max-h-[380px] w-[360px] overflow-y-auto"
          onEscapeKeyDown={() => {
            dismissedRef.current = true;
            triggerRef.current?.focus();
            close();
          }}
          onPointerLeave={() => context?.setActiveAnnotationId(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null) && event.relatedTarget !== triggerRef.current) close();
          }}
        >
          <ol aria-label={isDraft ? "草稿批注" : "已发送的批注"}>
            {annotations.map((annotation, index) => {
              const number = index + 1;
              const activate = () => context?.setActiveAnnotationId(annotation.annotationId);
              const body = (
                <>
                  {/* 已发送条目整条是 button，里面只能放 span。 */}
                  <span className={`${TEXT_CLASS} line-clamp-4`}>{annotation.selectedText}</span>
                  {annotation.comment ? (
                    <>
                      <span className={`${LABEL_CLASS} mt-2 block`}>评论：</span>
                      <span className={TEXT_CLASS}>{annotation.comment}</span>
                    </>
                  ) : null}
                </>
              );
              if (isDraft) {
                return (
                  <li className={ITEM_CLASS} key={annotation.annotationId} onPointerEnter={activate} onFocus={activate}>
                    <div className="flex min-h-6 items-center gap-1.5">
                      <span className="text-act-xs font-semibold leading-4 text-text-main tabular-nums">{number}.</span>
                      <span className={LABEL_CLASS}>选中文本：</span>
                      <span className="flex-1" />
                      <IconButton
                        label={`编辑第 ${number} 条批注`}
                        tooltip="编辑"
                        size="xs"
                        onClick={() => {
                          // 和 Escape 一样记为主动关闭：悬停留下的打开计时器晚到时不会把卡片重新打开。
                          dismissedRef.current = true;
                          setOpen(false);
                          context?.editAnnotation(annotation.annotationId);
                        }}
                      >
                        <Pencil size={13} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`删除第 ${number} 条批注`} tooltip="删除" size="xs" onClick={() => context?.removeDraft(annotation.annotationId)}>
                        <Trash2 size={13} aria-hidden="true" />
                      </IconButton>
                    </div>
                    {body}
                  </li>
                );
              }
              const available = availableIds.has(annotation.annotationId);
              const header = (
                <span className="flex min-h-6 items-center gap-1.5">
                  <span className="text-act-xs font-semibold leading-4 text-text-main tabular-nums">{number}.</span>
                  <span className={LABEL_CLASS}>选中文本：</span>
                  <span className="flex-1" />
                  {available ? null : <span className="text-act-xs leading-4 text-text-faint">原回复不可用</span>}
                </span>
              );
              return (
                <li className={ITEM_CLASS} key={annotation.annotationId}>
                  {available ? (
                    <button
                      type="button"
                      className={SENT_ITEM_BUTTON_CLASS}
                      aria-label={`定位第 ${number} 条批注的原文`}
                      onPointerEnter={activate}
                      onFocus={activate}
                      onClick={() => {
                        dismissedRef.current = true;
                        setOpen(false);
                        context?.locateAnnotation(annotation);
                      }}
                    >
                      {header}
                      {body}
                    </button>
                  ) : (
                    <div>
                      {header}
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </HoverCardContent>
      </HoverCard>
      {isDraft && onClear ? (
        <IconButton
          label="清空全部批注"
          variant="secondary"
          size="xs"
          shape="round"
          className="pointer-events-none absolute -right-2 -top-2 z-1 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
          onClick={() => {
            close();
            onClear();
          }}
        >
          <X size={12} strokeWidth={2.4} aria-hidden="true" />
        </IconButton>
      ) : null}
    </span>
  );
}
