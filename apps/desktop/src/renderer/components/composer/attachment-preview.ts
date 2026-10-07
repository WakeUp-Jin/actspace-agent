import type { ComposerAttachment } from "@actspace/shared";

/** 图片附件的预览是 blob URL：附件发送成功、被移除或替换、所在会话被 evict 时释放。 */
export function revokeAttachmentPreview(attachment: ComposerAttachment): void {
  if (attachment.previewUrl?.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

/** 释放 `attachments` 中、`kept` 里没有用到的预览。 */
export function revokeAttachmentPreviews(attachments: readonly ComposerAttachment[] | undefined, kept: readonly ComposerAttachment[] = []): void {
  if (!attachments?.length) return;
  const keptUrls = new Set(kept.map((attachment) => attachment.previewUrl).filter(Boolean));
  for (const attachment of attachments) {
    if (!attachment.previewUrl || !keptUrls.has(attachment.previewUrl)) revokeAttachmentPreview(attachment);
  }
}
