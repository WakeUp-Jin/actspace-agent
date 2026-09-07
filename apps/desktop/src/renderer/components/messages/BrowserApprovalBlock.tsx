import { Globe2 } from "lucide-react";
import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogLine } from "./ToolLogLine";

type BrowserApprovalMessage = Extract<MessageBlock, { kind: "tool" }>;
type BrowserDecision = "approve_once" | "deny";

const CARD_CLASS =
  "message-row w-full max-w-[800px] overflow-hidden rounded-act-md border border-line bg-surface";
const HEADER_CLASS =
  "flex min-h-9 items-center gap-2 border-b border-line px-[var(--conversation-card-padding)] text-sm font-medium text-text-main";
const BODY_CLASS =
  "px-[var(--conversation-card-padding)] py-3 text-[13px] leading-[1.55] text-text-muted";
const DETAIL_CLASS = "mt-1.5 text-xs leading-[1.5] text-text-faint";
const FOOTER_CLASS =
  "flex min-h-[46px] items-center justify-end gap-1.5 border-t border-line px-[var(--conversation-card-padding)] py-2";
const BUTTON_CLASS = "h-7 rounded-act-sm border-0 px-3 text-[13px] font-medium transition-colors disabled:opacity-50";
const DENY_CLASS = "bg-transparent text-text-muted hover:bg-surface-subtle focus-visible:bg-surface-subtle";
const ALLOW_CLASS = "bg-action text-on-action hover:bg-action-hover focus-visible:bg-action-hover";

async function submitBrowserApproval(requestId: string, decision: BrowserDecision): Promise<boolean> {
  if (typeof window === "undefined" || !window.actspace?.submitApproval) return false;
  try {
    const result = await window.actspace.submitApproval({ requestId, decision });
    return result.ok;
  } catch (error) {
    console.error("Failed to submit browser approval", error);
    return false;
  }
}

export function BrowserApprovalBlock({
  message,
  className,
}: {
  message: BrowserApprovalMessage;
  className?: string;
}) {
  const [submitting, setSubmitting] = useState<BrowserDecision | null>(null);
  const [resolvedDecision, setResolvedDecision] = useState<BrowserDecision | null>(null);
  const requestId = message.approvalRequestId;
  const disabled = !requestId || submitting !== null;

  const decide = async (decision: BrowserDecision) => {
    if (!requestId || submitting !== null) return;
    setSubmitting(decision);
    if (await submitBrowserApproval(requestId, decision)) {
      setResolvedDecision(decision);
    } else {
      setSubmitting(null);
    }
  };

  if (resolvedDecision) {
    return (
      <ToolLogLine
        className={className}
        message={{
          ...message,
          status: resolvedDecision === "deny" ? "denied" : "running",
          content: resolvedDecision === "deny" ? "本轮浏览器授权已拒绝" : "正在连接浏览器…",
          isError: resolvedDecision === "deny",
          approvalRequestId: undefined,
        }}
      />
    );
  }

  return (
    <article className={`${CARD_CLASS}${className ? ` ${className}` : ""}`}>
      <header className={HEADER_CLASS}>
        <Globe2 className="text-info" size={15} strokeWidth={2} aria-hidden="true" />
        允许 ActSpace 在当前会话中使用浏览器？
      </header>
      <div className={BODY_CLASS}>
        Agent 将能够查看和操作你的 Chrome 标签页，包括打开网页、点击、输入、截图和读取页面内容。
        <div className={DETAIL_CLASS}>允许后，本次应用运行期间该会话不再重复询问；拒绝只对当前这轮输入有效。</div>
      </div>
      <footer className={FOOTER_CLASS}>
        <button
          className={`${BUTTON_CLASS} ${DENY_CLASS}`}
          type="button"
          disabled={disabled}
          onClick={() => decide("deny")}
        >
          {submitting === "deny" ? "正在拒绝…" : "拒绝"}
        </button>
        <button
          className={`${BUTTON_CLASS} ${ALLOW_CLASS}`}
          type="button"
          disabled={disabled}
          onClick={() => decide("approve_once")}
        >
          {submitting === "approve_once" ? "正在允许…" : "允许"}
        </button>
      </footer>
    </article>
  );
}
