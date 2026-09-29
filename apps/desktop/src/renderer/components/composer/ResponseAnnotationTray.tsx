import { ChevronDown, MessageSquareQuote } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ResponseAnnotationReference } from "@actspace/shared";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { ResponseAnnotationCommentEditor } from "./ResponseAnnotationCommentEditor";

export type ResponseAnnotationEditRequest = { annotationId: string; nonce: number };

const TRAY_CLASS = "composer-annotation-tray mx-3 mt-3 rounded-act-md border border-line bg-surface-subtle";
const TRAY_HEADER_CLASS = "flex h-9 items-center gap-2 pl-3 pr-1 text-act-sm text-text-main";
const TRAY_LIST_CLASS = "max-h-[228px] overflow-y-auto border-t border-line px-2 py-2";
const CARD_CLASS = "rounded-act-sm px-2 py-2 [&+&]:mt-1 [&+&]:border-t [&+&]:border-line";
const CARD_INDEX_CLASS =
  "grid h-4 min-w-4 shrink-0 place-items-center rounded-act-pill border border-line bg-surface-raised px-1 text-act-xxs font-medium leading-none text-text-muted";

/**
 * Composer 顶部的回复引用托盘。只管展示和编辑，数据由上层受控持有：
 * 同一会话的草稿批注在切换会话、发送失败时由上层放回。
 */
export function ResponseAnnotationTray({
  annotations,
  onChange,
  notice,
  editRequest,
}: {
  annotations: readonly ResponseAnnotationReference[];
  onChange: (next: ResponseAnnotationReference[]) => void;
  notice?: string | null;
  editRequest?: ResponseAnnotationEditRequest | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousCountRef = useRef(annotations.length);

  // 新加进来的引用：自动展开，并把最后一张卡片滚进可见区。
  useLayoutEffect(() => {
    const grew = annotations.length > previousCountRef.current;
    previousCountRef.current = annotations.length;
    if (!grew) return;
    setExpanded(true);
    window.requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
  }, [annotations.length]);

  useEffect(() => {
    if (!editRequest) return;
    setExpanded(true);
    setEditingId(editRequest.annotationId);
  }, [editRequest]);

  if (annotations.length === 0) return null;

  const update = (annotationId: string, comment: string) => {
    onChange(annotations.map((annotation) => {
      if (annotation.annotationId !== annotationId) return annotation;
      const { comment: _previous, ...rest } = annotation;
      return comment ? { ...rest, comment } : rest;
    }));
    setEditingId(null);
  };

  return (
    <section className={TRAY_CLASS} aria-label="回复引用">
      <div className={TRAY_HEADER_CLASS}>
        <MessageSquareQuote size={15} className="text-text-muted" aria-hidden="true" />
        <span className="font-medium">{annotations.length} 条引用</span>
        {notice ? <span className="truncate text-act-xs text-text-muted" role="status">{notice}</span> : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setEditingId(null);
            onChange([]);
          }}
        >
          清空全部
        </Button>
        <IconButton
          label={expanded ? "收起引用" : "展开引用"}
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown size={15} className={`transition-transform duration-(--motion-fast) motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </IconButton>
      </div>
      {expanded ? (
        <div ref={listRef} className={TRAY_LIST_CLASS} role="list">
          {annotations.map((annotation, index) => {
            const editing = editingId === annotation.annotationId;
            return (
              <div className={CARD_CLASS} role="listitem" key={annotation.annotationId} aria-label={`引用 ${index + 1}`}>
                <div className="flex items-start gap-2">
                  <span className={`${CARD_INDEX_CLASS} mt-0.5`} aria-hidden="true">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 whitespace-pre-wrap break-words text-act-sm leading-5 text-text-main">{annotation.selectedText}</p>
                    {annotation.comment && !editing ? (
                      <p className="mt-0.5 line-clamp-1 break-words text-act-xs leading-4 text-text-muted">{annotation.comment}</p>
                    ) : null}
                  </div>
                  {editing ? null : (
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="xs" aria-label={`编辑引用 ${index + 1} 的评论`} onClick={() => setEditingId(annotation.annotationId)}>编辑</Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`移除引用 ${index + 1}`}
                        onClick={() => onChange(annotations.filter((item) => item.annotationId !== annotation.annotationId))}
                      >
                        移除
                      </Button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <ResponseAnnotationCommentEditor
                    key={editRequest?.annotationId === annotation.annotationId ? editRequest.nonce : undefined}
                    label={`引用 ${index + 1} 的评论`}
                    initialValue={annotation.comment ?? ""}
                    onSubmit={(comment) => update(annotation.annotationId, comment)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
