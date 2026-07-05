import { FileText } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ComposerAttachment, MessageBlock } from "@actspace/shared";

const USER_MESSAGE_CLASS = "message-row user-message flex justify-start animate-[rise-in_260ms_ease_both]";
const USER_CARD_CLASS =
  "user-card w-full rounded-act-lg border border-line bg-surface px-[var(--conversation-card-padding)] py-3 leading-[1.55] text-text-main shadow-[0_12px_34px_rgba(31,45,61,0.045)] dark:shadow-[0_12px_34px_rgba(0,0,0,0.3)]";
// 超长用户消息两态折叠（参考 Cursor）：
// - 默认折叠只露前几行 + 底部渐隐，不出滚动条，sticky 常驻顶部时遮挡最小；
// - 点击展开到更大高度、内部滚动，再点收起；拖选文字复制不触发切换。
// 短消息（未超过折叠高度）不参与，直接用展开态类渲染且无点击交互。
const USER_CONTENT_COLLAPSED_MAX_PX = 88;
const USER_CONTENT_COLLAPSED_CLASS = "max-h-[88px] overflow-hidden whitespace-pre-wrap";
const USER_CONTENT_EXPANDED_CLASS = "max-h-[min(240px,32vh)] overflow-y-auto whitespace-pre-wrap";
const USER_CONTENT_FADE_CLASS =
  "user-content-fade pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-surface to-transparent";
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

function UserMessageContent({ content }: { content: string }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // scrollHeight 是内容完整高度，不受 max-height 钳制影响；
  // 超过折叠高度才启用点击展开交互和渐隐遮罩。
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    setOverflows(element.scrollHeight > USER_CONTENT_COLLAPSED_MAX_PX + 2);
  }, [content]);

  // 展开后点击卡片以外的任意位置收起（参考 Cursor），不用非得再点一次卡片。
  useEffect(() => {
    if (!expanded) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (contentRef.current?.contains(target)) return;
      setExpanded(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [expanded]);

  const collapsed = overflows && !expanded;

  // 点击卡片只负责展开；收起只通过点击卡片外部触发（见上方 pointerdown 监听），
  // 避免用户在展开内容里点击/选择时卡片意外合上。
  function handleExpand() {
    if (!collapsed) return;
    // 用户在拖选文字复制时不展开。
    if (window.getSelection()?.toString()) return;
    setExpanded(true);
  }

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={`${collapsed ? USER_CONTENT_COLLAPSED_CLASS : USER_CONTENT_EXPANDED_CLASS}${
          collapsed ? " cursor-pointer" : ""
        }`}
        aria-expanded={overflows ? expanded : undefined}
        onClick={handleExpand}
      >
        {content}
      </div>
      {collapsed ? <div className={USER_CONTENT_FADE_CLASS} aria-hidden="true" /> : null}
    </div>
  );
}

export function UserMessage({ message }: { message: Extract<MessageBlock, { kind: "user" }> }) {
  const attachments = message.attachments ?? [];
  const analyses = message.attachmentAnalyses ?? [];

  return (
    <article className={USER_MESSAGE_CLASS}>
      <div className={USER_CARD_CLASS}>
        {message.content ? <UserMessageContent content={message.content} /> : null}
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
