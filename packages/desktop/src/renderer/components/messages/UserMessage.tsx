import { FileText } from "lucide-react";
import type { CSSProperties } from "react";
import type { ComposerAttachment, MessageBlock } from "@actspace/shared";

const USER_MESSAGE_CLASS = "message-row user-message flex justify-start animate-[rise-in_260ms_ease_both]";
const USER_CARD_CLASS =
  "user-card w-full rounded-act-lg border border-line bg-surface px-[var(--conversation-card-padding)] py-3 leading-[1.55] text-text-main shadow-[0_12px_34px_rgba(31,45,61,0.045)] dark:shadow-[0_12px_34px_rgba(0,0,0,0.3)]";
const USER_CONTENT_CLASS = "whitespace-pre-wrap";
const USER_ATTACHMENTS_CLASS = "mt-3 flex flex-wrap items-center gap-2";
const USER_IMAGE_ATTACHMENT_CLASS =
  "relative h-14 w-14 rounded-act-md border border-line bg-surface-subtle shadow-[0_6px_16px_rgba(31,45,61,0.06)]";
const USER_FILE_ATTACHMENT_CLASS =
  "inline-flex h-9 max-w-[240px] items-center gap-2 rounded-act-md border border-line bg-surface-subtle px-2.5 text-sm font-medium text-text-main";
const USER_FILE_NAME_CLASS = "truncate";
const ANALYSIS_WRAP_CLASS = "mt-3 rounded-act-md border border-line bg-surface-subtle px-3 py-2 text-sm text-text-muted";
const ANALYSIS_SUMMARY_CLASS = "cursor-pointer text-sm font-semibold text-text-main";
const ANALYSIS_BODY_CLASS = "mt-2 whitespace-pre-wrap text-sm leading-[1.55] text-text-muted";
const ANALYSIS_ERROR_CLASS = "text-on-danger";

function getAttachmentPreviewStyle(attachment: ComposerAttachment): CSSProperties | undefined {
  return attachment.previewUrl
    ? {
        backgroundImage: `url("${attachment.previewUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;
}

export function UserMessage({ message }: { message: Extract<MessageBlock, { kind: "user" }> }) {
  const attachments = message.attachments ?? [];
  const analyses = message.attachmentAnalyses ?? [];

  return (
    <article className={USER_MESSAGE_CLASS}>
      <div className={USER_CARD_CLASS}>
        {message.content ? <div className={USER_CONTENT_CLASS}>{message.content}</div> : null}
        {attachments.length > 0 ? (
          <div className={USER_ATTACHMENTS_CLASS} aria-label="Message attachments">
            {attachments.map((attachment) => {
              if (attachment.kind === "image") {
                return (
                  <div
                    className={USER_IMAGE_ATTACHMENT_CLASS}
                    aria-label={`Attached image ${attachment.name}`}
                    key={attachment.id}
                    style={getAttachmentPreviewStyle(attachment)}
                    title={attachment.name}
                  />
                );
              }

              return (
                <div className={USER_FILE_ATTACHMENT_CLASS} aria-label={`Attached file ${attachment.name}`} key={attachment.id}>
                  <FileText size={16} strokeWidth={1.9} aria-hidden="true" />
                  <span className={USER_FILE_NAME_CLASS}>{attachment.name}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {analyses.length > 0 ? (
          <div className={ANALYSIS_WRAP_CLASS} aria-label="Image analysis results">
            {analyses.map((analysis) => (
              <details key={analysis.attachmentId} open={analyses.length === 1}>
                <summary className={ANALYSIS_SUMMARY_CLASS}>图片分析结果</summary>
                <div className={`${ANALYSIS_BODY_CLASS}${analysis.status === "failed" ? ` ${ANALYSIS_ERROR_CLASS}` : ""}`}>
                  {analysis.status === "failed"
                    ? analysis.errorMessage ?? "图片分析失败，模型只能看到附件路径和文件名。"
                    : analysis.summary ?? "图片分析结果为空。"}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
