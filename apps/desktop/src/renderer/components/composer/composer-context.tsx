import { createContext, useCallback, useContext, useMemo } from "react";
import type { ComposerMode, ModelSelectionId, ResponseAnnotationReference, UsableModelView } from "@actspace/shared";
import type { SessionLocalStore } from "../../session/session-local-store";
import type { ComposerDraftReader, ComposerDraftRestore, ComposerDraftWriter } from "../Composer";
import type { MessageQueueControls } from "./MessageQueueTray";

export type ComposerDrafts = {
  readonly draftKey: string;
  readonly readDraft: ComposerDraftReader;
  readonly writeDraft: ComposerDraftWriter;
  /** 草稿回复批注按 draftKey 存在上层，切换会话、切到设置页再回来都不丢。 */
  readonly readAnnotationDraft: (draftKey: string) => ResponseAnnotationReference[];
  readonly writeAnnotationDraft: (draftKey: string, annotations: readonly ResponseAnnotationReference[]) => void;
};

/**
 * 输入框（14 S7，02 §3.3）：模式、技能、模型、草稿读写、消息队列和一次性提示。由 App 提供，WorkbenchLayout / ConversationView 读取。
 * 字段名沿用原来的 prop 名。草稿字段缺省时，Composer 和批注状态用组件自己的内存草稿（单独渲染时）。
 */
export type ComposerContextValue = Partial<ComposerDrafts> & {
  /** 运行中发送的消息队列；只在后续对话的 Composer 上显示。 */
  readonly messageQueue?: MessageQueueControls;
  /** Composer 上方的一次性提示，例如「对话还很短，暂时不需要压缩」。 */
  readonly composerNotice: string | null;
  readonly defaultModelId?: ModelSelectionId;
  readonly selectedModelId?: ModelSelectionId;
  readonly onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  readonly composerMode?: ComposerMode;
  readonly onComposerModeChange?: (mode: ComposerMode) => void | Promise<void>;
  readonly selectedSkills?: string[];
  readonly onSelectedSkillsChange?: (skills: string[]) => void;
  readonly models?: UsableModelView[];
  readonly draftRestore?: ComposerDraftRestore | null;
};

export const ComposerContext = createContext<ComposerContextValue | null>(null);

export function useComposerContext(): ComposerContextValue {
  const value = useContext(ComposerContext);
  if (!value) throw new Error("useComposerContext 需要 ComposerContext");
  return value;
}

/** 文字草稿和回复批注草稿按会话存在 SessionLocalStore 里，只存在内存里，归档时随会话一起释放。 */
export function useSessionDrafts(localStore: SessionLocalStore, sessionId: string | null): ComposerDrafts {
  const draftKey = sessionId ?? "__draft__";
  const readDraft = useCallback<ComposerDraftReader>((key) => localStore.get(key).composerText ?? "", [localStore]);
  const writeDraft = useCallback<ComposerDraftWriter>((key, text) => {
    localStore.update(key, (state) => (state.composerText ?? "") === text ? state : { ...state, composerText: text || undefined });
  }, [localStore]);
  const readAnnotationDraft = useCallback((key: string) => localStore.get(key).annotationDraft ?? [], [localStore]);
  const writeAnnotationDraft = useCallback((key: string, annotations: readonly ResponseAnnotationReference[]) => {
    localStore.update(key, (state) => annotations.length === 0 && !state.annotationDraft ? state : { ...state, annotationDraft: annotations.length ? [...annotations] : undefined });
  }, [localStore]);
  return useMemo(() => ({ draftKey, readDraft, writeDraft, readAnnotationDraft, writeAnnotationDraft }), [draftKey, readDraft, writeDraft, readAnnotationDraft, writeAnnotationDraft]);
}
