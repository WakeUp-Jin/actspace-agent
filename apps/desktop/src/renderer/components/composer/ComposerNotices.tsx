import type { ReactNode } from "react";
import type { ResponseAnnotationReference } from "@actspace/shared";
import type { HostUploadProgress } from "@actspace/shared/host-protocol";
import { ResponseAnnotationPill } from "./ResponseAnnotationPill";

export type ComposerNoticesProps = {
  /** 调用方接了回复批注才显示批注胶囊。 */
  annotations?: { items: readonly ResponseAnnotationReference[]; notice?: string | null; onClear: () => void };
  /** 输入框上方的一次性状态提示。 */
  statusNotice?: string | null;
  /** 远端发送等待 Host 确认中。 */
  sending: boolean;
  uploadProgress: HostUploadProgress | null;
  attachmentError: string | null;
  /** 附件条：排在批注之后、状态提示之前。 */
  children?: ReactNode;
};

/** 09 T30：输入面板里、输入行上方的内容，自上而下：回复批注、附件条（children）、状态提示、远端提交进度、附件错误。 */
export function ComposerNotices({ annotations, statusNotice, sending, uploadProgress, attachmentError, children }: ComposerNoticesProps) {
  return (
    <>
      {annotations && (annotations.items.length > 0 || annotations.notice) ? (
        <div className="composer-annotations flex min-w-0 items-center gap-2 px-3 pt-3">
          <ResponseAnnotationPill annotations={annotations.items} variant="draft" onClear={annotations.onClear} />
          {annotations.notice ? (
            <span className="truncate text-act-xs leading-4 text-text-muted" role="status">{annotations.notice}</span>
          ) : null}
        </div>
      ) : null}
      {children}
      {statusNotice ? (
        <div className="composer-status-notice px-3 pt-2 pb-1 text-act-xs leading-4 text-text-faint" role="status">
          {statusNotice}
        </div>
      ) : null}
      {sending ? (
        <div role="status" className="px-3 py-1 text-act-xs text-text-muted">
          {uploadProgress?.state === "uploading" ? `正在上传附件 ${Math.round(uploadProgress.bytes / Math.max(1, uploadProgress.total) * 100)}%` : "正在确认提交…"}
        </div>
      ) : null}
      {attachmentError ? (
        <div className="px-3 pb-1 text-act-xs leading-4 text-danger" role="alert">
          {attachmentError}
        </div>
      ) : null}
    </>
  );
}

/** 发送失败的提示，在输入框上方。附件卡片用 aria-describedby 指向它的 id。 */
export function ComposerSendErrorAlert({ message }: { message: string }) {
  return (
    <div id="composer-send-error" className="rounded-act-md border border-danger/30 bg-danger-subtle px-3 py-2 text-act-md leading-5 text-danger" role="alert">
      {message}
    </div>
  );
}
