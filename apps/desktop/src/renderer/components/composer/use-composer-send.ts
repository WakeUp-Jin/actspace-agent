import { useEffect, useRef, useState } from "react";
import type { ChatAttachmentIssue, ComposerAttachment, ComposerMode, ModelSelectionId, ResponseAnnotationReference } from "@actspace/shared";
import type { HostUploadProgress } from "@actspace/shared/host-protocol";
import { eventsApi } from "../../api/events";
import { revokeAttachmentPreview } from "./attachment-preview";
import type { ComposerSendOptions } from "./composer-types";
import type { ComposerModelRuntimeOptions } from "./model-options";

/** 发送时带上的模型、模式、Skills 和运行时选项；推理强度只在开着 Thinking 时带。/compact 不带附件和回复引用。 */
export function composerSendOptions(input: {
  readonly model: ModelSelectionId;
  readonly mode: ComposerMode;
  readonly selectedSkills: string[];
  readonly runtimeOptions: ComposerModelRuntimeOptions;
  readonly attachments?: ComposerAttachment[];
  readonly responseAnnotations?: readonly ResponseAnnotationReference[];
}): ComposerSendOptions {
  const options: ComposerSendOptions = {
    model: input.model,
    mode: input.mode,
    selectedSkills: input.selectedSkills,
    thinkingEnabled: input.runtimeOptions.thinkingEnabled,
  };
  if (input.runtimeOptions.thinkingEnabled && input.runtimeOptions.reasoningEffort) options.reasoningEffort = input.runtimeOptions.reasoningEffort;
  if (input.attachments && input.attachments.length > 0) options.attachments = input.attachments;
  if (input.responseAnnotations && input.responseAnnotations.length > 0) options.responseAnnotations = [...input.responseAnnotations];
  return options;
}

export type ComposerSendError = { message: string; issue?: ChatAttachmentIssue };

export type ComposerSendInput = {
  readonly sessionId?: string | null;
  readonly draftKey?: string;
  readonly writeDraft?: (draftKey: string, text: string) => void;
  readonly onSend?: (text: string, options: ComposerSendOptions) => void | Promise<void>;
  /** 远端发送要等 Host 确认（附件可能还要上传），确认前不能再发。 */
  readonly remote: boolean;
  /** 有内容且模型可用。 */
  readonly ready: boolean;
  readonly text: string;
  readonly attachments: readonly ComposerAttachment[];
  /** 发送已经开始：清空输入框、附件、回复引用，收起浮层。 */
  readonly clearDraft: () => void;
  /** 发送失败且还在同一个会话：把文字和附件放回来（App 已经恢复过的不覆盖）。 */
  readonly restoreDraft: (text: string, attachments: ComposerAttachment[]) => void;
};

/**
 * 09 T30：发送。发出去就清空草稿；失败时草稿写回原会话，还在这个会话时放回输入框并显示错误。
 * 远端发送在 Host 确认前显示「正在确认提交…」或上传进度。
 */
export function useComposerSend({ sessionId, draftKey, writeDraft, onSend, remote, ready, text, attachments, clearDraft, restoreDraft }: ComposerSendInput) {
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [uploadProgress, setUploadProgress] = useState<HostUploadProgress | null>(null);
  useEffect(() => eventsApi.hostUploadProgress(value => { if (value.sessionId === sessionId) setUploadProgress(value.state === "finished" ? null : value); }), [sessionId]);
  const [error, setError] = useState<ComposerSendError | null>(null);
  const activeDraftKeyRef = useRef(draftKey);
  activeDraftKeyRef.current = draftKey;
  const canSend = ready && !sending;

  function send(options: ComposerSendOptions) {
    if (!canSend || !onSend || sendingRef.current) return;
    const message = text;
    const sentAttachments = [...attachments];
    if (remote) { sendingRef.current = true; setSending(true); }
    let sendResult: void | Promise<void>;
    try { sendResult = onSend(message.trim(), options); } catch (sendError) { sendResult = Promise.reject(sendError); }
    void Promise.resolve(sendResult).then(() => { sentAttachments.forEach(revokeAttachmentPreview); }).catch((sendError: unknown) => {
      if (draftKey) writeDraft?.(draftKey, message);
      if (activeDraftKeyRef.current !== draftKey) return;
      // 兜底：App 已经恢复过草稿（带格式化的错误和附件问题）时，不覆盖它。
      restoreDraft(message, sentAttachments);
      setError(current => current ?? { message: sendError instanceof Error ? sendError.message : "发送失败，草稿已保留" });
    }).finally(() => {
      sendingRef.current = false; setSending(false); setUploadProgress(null);
    });
    clearDraft();
    setError(null);
  }

  // 移除的附件正是发送错误指向的那个，或者移除后文本总量回到上限以内：错误不再成立，收起。
  function clearAttachmentIssue(attachmentId: string) {
    setError((current) => {
      if (!current?.issue) return current;
      if (current.issue.attachmentId === attachmentId) return null;
      if (current.issue.code !== "total_text_too_large" || !current.issue.textCharacterCounts) return current;
      const counts = { ...current.issue.textCharacterCounts };
      delete counts[attachmentId];
      return Object.values(counts).reduce((sum, count) => sum + count, 0) > (current.issue.limit ?? 256_000)
        ? { ...current, issue: { ...current.issue, textCharacterCounts: counts } } : null;
    });
  }

  return { canSend, sending, uploadProgress, error, setError, send, clearAttachmentIssue };
}
