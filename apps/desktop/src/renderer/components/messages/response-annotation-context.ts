import { createContext, useContext } from "react";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";

/** 已发送的一条批注：`label` 是它在目标回复上的编号，从 1 开始。 */
export type SentResponseAnnotation = {
  annotation: ResponseAnnotationReference;
  label: number;
  sourceUserMessageId: string;
};

export type ResponseAnnotationContextValue = {
  sentByMessageId: ReadonlyMap<string, readonly SentResponseAnnotation[]>;
  canAnnotate: (assistantMessageId: string) => boolean;
  onAddAnnotation: (annotation: ResponseAnnotationReference) => void;
  onCopyToDraft: (annotation: ResponseAnnotationReference) => void;
  /** 当前选中（高亮原文）的已发送批注。 */
  activeAnnotationId: string | null;
  setActiveAnnotationId: (annotationId: string | null) => void;
  /** marker 层把定位结果报回来，用户消息摘要据此显示「原回复不可用」。 */
  reportResolution: (annotationId: string, resolved: boolean) => void;
  isAnnotationAvailable: (annotation: ResponseAnnotationReference) => boolean;
  locateAnnotation: (annotation: ResponseAnnotationReference) => void;
};

export const ResponseAnnotationContext = createContext<ResponseAnnotationContextValue | null>(null);

export function useResponseAnnotations(): ResponseAnnotationContextValue | null {
  return useContext(ResponseAnnotationContext);
}

/** 只有落盘后的回复（id 为 `v2-<journal seq>`）能被批注；流式中和刚结束还没刷新投影的回复 id 是 `turn:` 形态，main 不认。 */
export function isAnnotatableMessageId(messageId: string): boolean {
  return /^v2-\d+$/.test(messageId);
}

export const MAX_MARKERS_PER_REPLY = 20;

/** 按用户消息出现顺序给每条回复上的批注编号。 */
export function indexSentAnnotations(messages: readonly MessageBlock[]): Map<string, SentResponseAnnotation[]> {
  const index = new Map<string, SentResponseAnnotation[]>();
  for (const message of messages) {
    if (message.kind !== "user" || !message.responseAnnotations?.length) continue;
    for (const annotation of message.responseAnnotations) {
      const list = index.get(annotation.assistantMessageId) ?? [];
      list.push({ annotation, label: list.length + 1, sourceUserMessageId: message.id });
      index.set(annotation.assistantMessageId, list);
    }
  }
  return index;
}

/** 内容没变的回复沿用上一轮的数组引用：流式增量会让 messages 每帧都变，但不该让每条回复的 marker 重新测量。 */
export function reuseUnchangedAnnotationLists(
  previous: ReadonlyMap<string, readonly SentResponseAnnotation[]>,
  next: Map<string, SentResponseAnnotation[]>,
): Map<string, readonly SentResponseAnnotation[]> {
  const result = new Map<string, readonly SentResponseAnnotation[]>();
  for (const [messageId, list] of next) {
    const before = previous.get(messageId);
    const same = before?.length === list.length && before.every((item, index) => {
      const candidate = list[index]!;
      // 已发送批注不可变：同一 id 就是同一段内容。投影重建消息对象时引用会变，所以按 id 比较。
      return item.annotation.annotationId === candidate.annotation.annotationId && item.sourceUserMessageId === candidate.sourceUserMessageId;
    });
    result.set(messageId, same ? before! : list);
  }
  return result;
}
