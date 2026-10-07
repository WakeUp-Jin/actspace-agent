import { useEffect, useState, type RefObject } from "react";
import type { ComposerDraftReader, ComposerDraftRestore, ComposerDraftWriter } from "./composer-types";

export type ComposerDraftOptions = {
  readonly draftKey?: string;
  readonly readDraft?: ComposerDraftReader;
  readonly writeDraft?: ComposerDraftWriter;
  readonly draftRestore?: ComposerDraftRestore;
  readonly focusRequestId: number;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  /** 换会话、换入新草稿之后：收起上一个会话的错误、历史游标、斜杠菜单和多行状态。 */
  readonly onSwitched: () => void;
  /** 发送失败后恢复草稿（文字已在这里写回）：Composer 换回附件和错误。 */
  readonly onRestored: (restore: ComposerDraftRestore) => void;
};

/**
 * 09 T30：输入框文字草稿。按 draftKey 读写（16 T14），换会话换入新会话的草稿；
 * 发送失败的恢复和「聚焦输入框」请求也在这里。
 */
export function useComposerDraft({ draftKey, readDraft, writeDraft, draftRestore, focusRequestId, inputRef, onSwitched, onRestored }: ComposerDraftOptions) {
  const [message, setMessage] = useState(() => draftKey && readDraft ? readDraft(draftKey) : "");

  useEffect(() => {
    if (!draftKey || !readDraft) return;
    setMessage(readDraft(draftKey));
    onSwitched();
  }, [draftKey, readDraft]);

  useEffect(() => {
    if (!draftRestore || draftRestore.sessionId !== draftKey) return;
    setMessage(draftRestore.text);
    if (draftKey) writeDraft?.(draftKey, draftRestore.text);
    onRestored(draftRestore);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftKey, draftRestore, writeDraft]);

  useEffect(() => {
    if (focusRequestId <= 0) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId]);

  return {
    message,
    setMessage,
    /** 改文字并写回当前 draftKey 的草稿。 */
    setText(text: string) {
      setMessage(text);
      if (draftKey) writeDraft?.(draftKey, text);
    },
  };
}
