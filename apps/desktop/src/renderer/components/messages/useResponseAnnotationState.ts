import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { COMPOSER_REFERENCE_LIMITS, responseAnnotationKey, type MessageBlock, type ResponseAnnotationReference } from "@actspace/shared";
import type { ComposerDraftRestore } from "../Composer";
import type { ResponseAnnotationEditRequest } from "../composer/ResponseAnnotationTray";
import { indexSentAnnotations, isAnnotatableMessageId, reuseUnchangedAnnotationLists, type ResponseAnnotationContextValue, type SentResponseAnnotation } from "./response-annotation-context";
import { createAnnotationId } from "./response-annotation-text";

const EMPTY: ResponseAnnotationReference[] = [];

/**
 * 会话级回复批注状态：草稿批注（受控传给 Composer 托盘）、已发送批注索引、选中态和定位结果。
 * 草稿按 draftKey 读写上层存储，切会话天然隔离；发送失败时 draftRestore 把批注放回。
 */
export function useResponseAnnotationState({
  messages,
  draftKey,
  draftRestore,
  readAnnotationDraft,
  writeAnnotationDraft,
  scrollContainerRef,
}: {
  messages: readonly MessageBlock[];
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
  const [editRequest, setEditRequest] = useState<ResponseAnnotationEditRequest | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [unresolvedIds, setUnresolvedIds] = useState<ReadonlySet<string>>(() => new Set());

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
    setEditRequest(null);
    setActiveAnnotationId(null);
  }, [readDraft, replaceDrafts]);

  useEffect(() => {
    if (!draftRestore || draftRestore.sessionId !== draftKey) return;
    setDrafts(draftRestore.responseAnnotations ?? EMPTY);
  }, [draftKey, draftRestore, setDrafts]);

  /** 同一条回复的同一段范围只保留一条；超过上限时提示而不是静默丢弃。返回最终在草稿里的那一条。 */
  const addDraft = useCallback((annotation: ResponseAnnotationReference): ResponseAnnotationReference | null => {
    const current = draftsRef.current;
    const key = responseAnnotationKey(annotation);
    const existing = current.find((item) => responseAnnotationKey(item) === key);
    if (existing) return existing;
    if (current.length >= COMPOSER_REFERENCE_LIMITS.maxResponseAnnotations) {
      setNotice(`最多引用 ${COMPOSER_REFERENCE_LIMITS.maxResponseAnnotations} 段回复`);
      return null;
    }
    setDrafts([...current, annotation]);
    return annotation;
  }, [setDrafts]);

  const onAddAnnotation = useCallback((annotation: ResponseAnnotationReference) => {
    addDraft(annotation);
  }, [addDraft]);

  const onCopyToDraft = useCallback((annotation: ResponseAnnotationReference) => {
    const added = addDraft({ ...annotation, annotationId: createAnnotationId() });
    if (added) setEditRequest({ annotationId: added.annotationId, nonce: Date.now() });
  }, [addDraft]);

  const reportResolution = useCallback((annotationId: string, resolved: boolean) => {
    setUnresolvedIds((current) => {
      if (current.has(annotationId) !== resolved) return current;
      const next = new Set(current);
      if (resolved) next.delete(annotationId);
      else next.add(annotationId);
      return next;
    });
  }, []);

  const sentIndexRef = useRef<ReadonlyMap<string, readonly SentResponseAnnotation[]>>(new Map());
  const sentByMessageId = useMemo(() => {
    sentIndexRef.current = reuseUnchangedAnnotationLists(sentIndexRef.current, indexSentAnnotations(messages));
    return sentIndexRef.current;
  }, [messages]);
  const loadedReplyIds = useMemo(
    () => new Set(messages.flatMap((message) => (message.kind === "assistant" ? [message.id] : []))),
    [messages],
  );

  const locateAnnotation = useCallback((annotation: ResponseAnnotationReference) => {
    const replies = scrollContainerRef.current?.querySelectorAll<HTMLElement>("[data-assistant-message-id]") ?? [];
    const reply = Array.from(replies).find((element) => element.dataset.assistantMessageId === annotation.assistantMessageId);
    if (!reply) return;
    reply.scrollIntoView({ block: "center", behavior: "smooth" });
    setActiveAnnotationId(annotation.annotationId);
  }, [scrollContainerRef]);

  const contextValue = useMemo<ResponseAnnotationContextValue>(() => ({
    sentByMessageId,
    canAnnotate: isAnnotatableMessageId,
    onAddAnnotation,
    onCopyToDraft,
    activeAnnotationId,
    setActiveAnnotationId,
    reportResolution,
    isAnnotationAvailable: (annotation) => loadedReplyIds.has(annotation.assistantMessageId) && !unresolvedIds.has(annotation.annotationId),
    locateAnnotation,
  }), [activeAnnotationId, loadedReplyIds, locateAnnotation, onAddAnnotation, onCopyToDraft, reportResolution, sentByMessageId, unresolvedIds]);

  return { contextValue, drafts, setDrafts, notice, editRequest };
}
