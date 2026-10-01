import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { COMPOSER_REFERENCE_LIMITS, responseAnnotationKey, type ResponseAnnotationReference } from "@actspace/shared";
import type { ComposerDraftRestore } from "../Composer";
import { isAnnotatableMessageId, type ResponseAnnotationContextValue } from "./response-annotation-context";
import { resolveAnnotationRange } from "./response-annotation-text";

const EMPTY: ResponseAnnotationReference[] = [];
const LOCATE_HIGHLIGHT_MS = 1600;

function scrollRangeIntoView(range: Range, behavior: ScrollBehavior) {
  const node = range.startContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  element?.scrollIntoView?.({ block: "center", behavior });
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 会话级回复批注状态：草稿批注（受控传给 Composer 胶囊）、评论框编辑中的那条、加深高亮的那条。
 * 草稿按 draftKey 读写上层存储，切会话天然隔离；发送失败时 draftRestore 把批注放回。
 */
export function useResponseAnnotationState({
  draftKey,
  draftRestore,
  readAnnotationDraft,
  writeAnnotationDraft,
  scrollContainerRef,
}: {
  draftKey?: string;
  draftRestore?: ComposerDraftRestore | null;
  readAnnotationDraft?: (draftKey: string) => ResponseAnnotationReference[];
  writeAnnotationDraft?: (draftKey: string, annotations: readonly ResponseAnnotationReference[]) => void;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const readDraft = useCallback(() => (draftKey && readAnnotationDraft ? readAnnotationDraft(draftKey) : EMPTY), [draftKey, readAnnotationDraft]);
  const [drafts, setDraftState] = useState<ResponseAnnotationReference[]>(readDraft);
  const draftsRef = useRef(drafts);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const locateTimerRef = useRef<number | null>(null);

  const replaceDrafts = useCallback((next: ResponseAnnotationReference[]) => {
    draftsRef.current = next;
    setDraftState(next);
    setNotice(null);
  }, []);

  const setDrafts = useCallback((next: ResponseAnnotationReference[]) => {
    replaceDrafts(next);
    if (draftKey) writeAnnotationDraft?.(draftKey, next);
  }, [draftKey, replaceDrafts, writeAnnotationDraft]);

  useEffect(() => {
    replaceDrafts(readDraft());
    setEditingAnnotationId(null);
    setActiveAnnotationId(null);
  }, [readDraft, replaceDrafts]);

  useEffect(() => {
    if (!draftRestore || draftRestore.sessionId !== draftKey) return;
    setDrafts(draftRestore.responseAnnotations ?? EMPTY);
  }, [draftKey, draftRestore, setDrafts]);

  useEffect(() => () => {
    if (locateTimerRef.current !== null) window.clearTimeout(locateTimerRef.current);
  }, []);

  /** 同一条回复的同一段范围只保留一条（重复添加时打开已有那条的评论框）；超过上限时提示而不是静默丢弃。 */
  const addDraft = useCallback((annotation: ResponseAnnotationReference) => {
    const current = draftsRef.current;
    const key = responseAnnotationKey(annotation);
    const existing = current.find((item) => responseAnnotationKey(item) === key);
    if (existing) {
      setEditingAnnotationId(existing.annotationId);
      return;
    }
    if (current.length >= COMPOSER_REFERENCE_LIMITS.maxResponseAnnotations) {
      setNotice(`最多引用 ${COMPOSER_REFERENCE_LIMITS.maxResponseAnnotations} 段回复`);
      return;
    }
    setDrafts([...current, annotation]);
    setEditingAnnotationId(annotation.annotationId);
  }, [setDrafts]);

  const updateComment = useCallback((annotationId: string, comment: string) => {
    setDrafts(draftsRef.current.map((annotation) => {
      if (annotation.annotationId !== annotationId) return annotation;
      const { comment: _previous, ...rest } = annotation;
      return comment ? { ...rest, comment } : rest;
    }));
  }, [setDrafts]);

  const removeDraft = useCallback((annotationId: string) => {
    setDrafts(draftsRef.current.filter((annotation) => annotation.annotationId !== annotationId));
    setEditingAnnotationId((current) => (current === annotationId ? null : current));
    setActiveAnnotationId((current) => (current === annotationId ? null : current));
  }, [setDrafts]);

  const resolveRange = useCallback((annotation: ResponseAnnotationReference) => {
    const container = scrollContainerRef.current;
    return container ? resolveAnnotationRange(container, annotation) : null;
  }, [scrollContainerRef]);

  const locateAnnotation = useCallback((annotation: ResponseAnnotationReference) => {
    const range = resolveRange(annotation);
    if (!range) return;
    scrollRangeIntoView(range, prefersReducedMotion() ? "auto" : "smooth");
    setActiveAnnotationId(annotation.annotationId);
    if (locateTimerRef.current !== null) window.clearTimeout(locateTimerRef.current);
    locateTimerRef.current = window.setTimeout(() => {
      locateTimerRef.current = null;
      setActiveAnnotationId((current) => (current === annotation.annotationId ? null : current));
    }, LOCATE_HIGHLIGHT_MS);
  }, [resolveRange]);

  const editAnnotation = useCallback((annotationId: string) => {
    const annotation = draftsRef.current.find((item) => item.annotationId === annotationId);
    const range = annotation ? resolveRange(annotation) : null;
    if (!range) return;
    // 瞬时滚动：评论框按原文当前位置定位，平滑滚动途中打开会落在旧位置。
    scrollRangeIntoView(range, "auto");
    window.requestAnimationFrame(() => setEditingAnnotationId(annotationId));
  }, [resolveRange]);

  const contextValue = useMemo<ResponseAnnotationContextValue>(() => ({
    drafts,
    canAnnotate: isAnnotatableMessageId,
    addDraft,
    updateComment,
    removeDraft,
    editingAnnotationId,
    setEditingAnnotationId,
    activeAnnotationId,
    setActiveAnnotationId,
    resolveRange,
    locateAnnotation,
    editAnnotation,
  }), [activeAnnotationId, addDraft, drafts, editAnnotation, editingAnnotationId, locateAnnotation, removeDraft, resolveRange, updateComment]);

  return { contextValue, drafts, setDrafts, notice };
}
