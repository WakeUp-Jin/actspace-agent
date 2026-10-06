import { createContext, useContext } from "react";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";

export type ResponseAnnotationContextValue = {
  /** 当前会话的草稿批注，顺序即 Composer 卡片和回复圆点上的编号。 */
  drafts: readonly ResponseAnnotationReference[];
  canAnnotate: (assistantMessageId: string) => boolean;
  /** 加入草稿（同一范围去重、超上限提示），成功后打开它的评论框。 */
  addDraft: (annotation: ResponseAnnotationReference) => void;
  updateComment: (annotationId: string, comment: string) => void;
  removeDraft: (annotationId: string) => void;
  /** 评论框正在编辑的草稿。 */
  editingAnnotationId: string | null;
  setEditingAnnotationId: (annotationId: string | null) => void;
  /** 原文高亮加深的那一条（悬停卡片条目或定位中），草稿和已发送都可以。 */
  activeAnnotationId: string | null;
  setActiveAnnotationId: (annotationId: string | null) => void;
  /** 在已渲染的回复里定位原文；回复不在已加载历史里或前后文对不上时返回 null。 */
  resolveRange: (annotation: ResponseAnnotationReference) => Range | null;
  /** 滚到原文并短暂加深高亮。 */
  locateAnnotation: (annotation: ResponseAnnotationReference) => void;
  /** 滚到草稿原文，再打开它的评论框。 */
  editAnnotation: (annotationId: string) => void;
};

export const ResponseAnnotationContext = createContext<ResponseAnnotationContextValue | null>(null);

export function useResponseAnnotations(): ResponseAnnotationContextValue | null {
  return useContext(ResponseAnnotationContext);
}

/**
 * 只有落盘后的回复能被批注：durable 块带来源 envelope 的 sourceSeq（14 T11/T12），id 是 main 认的 journal 形态；
 * 流式中和刚结束还没刷新投影的 live 块没有 sourceSeq。
 */
export function annotatableMessageIds(blocks: readonly MessageBlock[]): ReadonlySet<string> {
  return new Set(blocks.flatMap((block) => block.sourceSeq === undefined ? [] : [block.id]));
}
