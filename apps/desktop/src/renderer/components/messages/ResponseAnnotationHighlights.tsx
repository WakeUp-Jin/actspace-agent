import { useLayoutEffect, type RefObject } from "react";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { useResponseAnnotations } from "./response-annotation-context";

const HIGHLIGHT_NAME = "act-annotation";
const ACTIVE_HIGHLIGHT_NAME = "act-annotation-active";

type HighlightRegistry = { set: (name: string, highlight: unknown) => void; delete: (name: string) => boolean };

function highlightRegistry(): { registry: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  return registry && Highlight ? { registry, Highlight } : null;
}

/**
 * 会话里唯一的原文高亮注册（CSS Custom Highlight API，不改 DOM）：
 * 草稿批注是常规档；悬停卡片条目或定位中的那条（草稿或已发送）是加深档。
 * 回复 DOM 可能晚于本组件提交（列表首帧后才渲染、分页加载、回复重渲染换掉文本节点），
 * 所以有东西要高亮时观察消息区的 DOM 变化，下一帧重新解析。环境不支持时什么也不做。
 */
export function ResponseAnnotationHighlights({
  messages,
  scrollContainerRef,
}: {
  messages: readonly MessageBlock[];
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const context = useResponseAnnotations();
  const drafts = context?.drafts;
  const activeId = context?.activeAnnotationId ?? null;
  const resolveRange = context?.resolveRange;
  const activeAnnotation = activeId ? findAnnotation(messages, drafts ?? [], activeId) : null;

  useLayoutEffect(() => {
    const highlights = highlightRegistry();
    if (!highlights || !resolveRange || !drafts) return;
    const register = () => {
      const normal = drafts
        .filter((annotation) => annotation.annotationId !== activeId)
        .flatMap((annotation) => resolveRange(annotation) ?? []);
      const active = activeAnnotation ? resolveRange(activeAnnotation) : null;
      if (normal.length > 0) highlights.registry.set(HIGHLIGHT_NAME, new highlights.Highlight(...normal));
      else highlights.registry.delete(HIGHLIGHT_NAME);
      if (active) highlights.registry.set(ACTIVE_HIGHLIGHT_NAME, new highlights.Highlight(active));
      else highlights.registry.delete(ACTIVE_HIGHLIGHT_NAME);
    };
    register();
    const container = scrollContainerRef.current;
    if ((drafts.length === 0 && !activeAnnotation) || !container || typeof MutationObserver === "undefined") return;
    let frame: number | null = null;
    const observer = new MutationObserver(() => {
      if (frame === null) frame = window.requestAnimationFrame(() => {
        frame = null;
        register();
      });
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeAnnotation, activeId, drafts, messages, resolveRange, scrollContainerRef]);

  useLayoutEffect(() => () => {
    const highlights = highlightRegistry();
    highlights?.registry.delete(HIGHLIGHT_NAME);
    highlights?.registry.delete(ACTIVE_HIGHLIGHT_NAME);
  }, []);

  return null;
}

function findAnnotation(
  messages: readonly MessageBlock[],
  drafts: readonly ResponseAnnotationReference[],
  annotationId: string,
): ResponseAnnotationReference | null {
  const draft = drafts.find((annotation) => annotation.annotationId === annotationId);
  if (draft) return draft;
  for (const message of messages) {
    if (message.kind !== "user") continue;
    const sent = message.responseAnnotations?.find((annotation) => annotation.annotationId === annotationId);
    if (sent) return sent;
  }
  return null;
}
