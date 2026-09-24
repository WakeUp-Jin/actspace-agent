import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import type { GrantSuggestion } from "@actspace/shared/runtime-v2";
import {
  getToolLogRunningTextAttrs,
  TOOL_LOG_LINE_CLASS,
  TOOL_LOG_LINE_ERROR_CLASS,
  TOOL_LOG_LINE_RUNNING_CLASS,
  TOOL_LOG_LINE_TEXT_CLASS,
  TOOL_LOG_LINE_TEXT_RUNNING_CLASS,
} from "./toolLogStyles";

type FileDiffMessage =
  | Extract<MessageBlock, { kind: "edit_diff" }>
  | Extract<MessageBlock, { kind: "write_diff" }>;

type FileDiffDecision = "once" | "session" | "deny";

const DIFF_APPROVAL_CLASS =
  "message-row file-diff-approval w-full max-w-[800px] overflow-hidden rounded-act-md border border-line bg-surface";
const DIFF_APPROVAL_HEADER_CLASS =
  "file-diff-approval-header flex min-h-8 items-center justify-between border-b border-line py-0 pr-[9px] pl-[var(--conversation-card-padding)]";
const DIFF_APPROVAL_TITLE_CLASS = "file-diff-approval-title min-w-0 text-sm font-medium text-text-muted";
const DIFF_APPROVAL_TARGET_CLASS =
  "file-diff-approval-target border-b border-line bg-surface-subtle px-[var(--conversation-card-padding)] py-[9px] font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.55] text-text-muted [overflow-wrap:anywhere]";
const DIFF_APPROVAL_REASON_CLASS =
  "file-diff-approval-reason px-[var(--conversation-card-padding)] pt-2 text-[13px] leading-[1.45] text-text-muted";
const DIFF_APPROVAL_REASON_LABEL_CLASS = "font-semibold text-text-faint";
const DIFF_APPROVAL_FOOTER_CLASS =
  "file-diff-approval-footer flex min-h-[46px] items-center justify-end gap-1.5 pt-[7px] pr-[10px] pb-[9px] pl-[var(--conversation-card-padding)]";
const DIFF_ACTION_CLASS =
  "file-diff-action h-7 min-w-0 rounded-act-sm border-0 px-[9px] text-[13px] font-medium";
const DIFF_ACTION_GHOST_CLASS =
  "file-diff-action-ghost bg-transparent text-text-muted hover:bg-surface-subtle focus-visible:bg-surface-subtle";
const DIFF_ACTION_PRIMARY_CLASS =
  "file-diff-action-primary bg-action text-on-action hover:bg-action-hover focus-visible:bg-action-hover";
const DIFF_ERROR_DETAIL_CLASS =
  "file-diff-error-detail mx-[var(--conversation-text-inset)] mt-1 rounded-act-sm bg-surface-subtle px-[9px] py-[7px] font-mono text-xs leading-[1.55] text-text-muted [overflow-wrap:anywhere]";

async function submitFileDiffApproval(requestId: string, decision: FileDiffDecision, suggestionId?: string): Promise<boolean> {
  if (typeof window === "undefined" || !window.actspace?.submitApproval) {
    console.warn("submitApproval bridge unavailable");
    return false;
  }
  try {
    const result = await window.actspace.submitApproval(decision === "session" && suggestionId ? { requestId, decision, suggestionId } : { requestId, decision: decision === "session" ? "deny" : decision });
    if (!result.ok) {
      console.warn("File write approval was not accepted", result.reason);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to submit file write approval", error);
    return false;
  }
}

function StatusLine({
  text,
  isError,
  className,
}: {
  text: string;
  isError?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${TOOL_LOG_LINE_CLASS}${isError ? ` ${TOOL_LOG_LINE_ERROR_CLASS}` : ""}${className ? ` ${className}` : ""}`}
    >
      <span className={TOOL_LOG_LINE_TEXT_CLASS}>{text}</span>
    </div>
  );
}

function FileDiffApprovalCard({
  message,
  actionLabel,
  className,
}: {
  message: FileDiffMessage;
  actionLabel: string;
  className?: string;
}) {
  const [submitting, setSubmitting] = useState<FileDiffDecision | null>(null);
  const [resolvedDecision, setResolvedDecision] = useState<FileDiffDecision | null>(null);
  const [grantSuggestions, setGrantSuggestions] = useState<readonly GrantSuggestion[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);

  const requestId = message.approvalRequestId;
  const disabled = !requestId || submitting !== null;

  useEffect(() => {
    let active = true;
    if (!requestId || !window.actspace?.listPendingApprovals) return;
    void window.actspace.listPendingApprovals().then((pending) => {
      if (active) setGrantSuggestions(pending.find((request) => request.requestId === requestId)?.grantSuggestions ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [requestId]);

  const decide = async (decision: FileDiffDecision, suggestionId?: string) => {
    if (!requestId || submitting !== null) return;
    setSubmitting(decision);
    const submitted = await submitFileDiffApproval(requestId, decision, suggestionId);
    if (submitted) {
      setResolvedDecision(decision);
    } else {
      setSubmitting(null);
    }
  };

  if (resolvedDecision) {
    return (
      <StatusLine
        className={className}
        isError={resolvedDecision === "deny"}
        text={
          resolvedDecision === "deny"
            ? `Denied ${actionLabel.toLowerCase()} ${message.filePath}`
            : `${actionLabel} ${message.filePath}`
        }
      />
    );
  }

  return (
    <article className={`${DIFF_APPROVAL_CLASS}${className ? ` ${className}` : ""}`}>
      <header className={DIFF_APPROVAL_HEADER_CLASS}>
        <span className={DIFF_APPROVAL_TITLE_CLASS}>{actionLabel} file requires approval</span>
      </header>

      <div className={DIFF_APPROVAL_TARGET_CLASS}>{message.filePath}</div>

      {message.reason ? (
        <div className={DIFF_APPROVAL_REASON_CLASS}>
          <strong className={DIFF_APPROVAL_REASON_LABEL_CLASS}>Reason:</strong> {message.reason}
        </div>
      ) : null}

      {grantSuggestions.length > 0 ? <div className="px-[var(--conversation-card-padding)] pt-2 text-xs text-text-muted">
        {grantSuggestions.filter((suggestion) => suggestion.selector.kind === "exact").map((suggestion) => <button className="mr-1.5 rounded-act-sm border border-line bg-surface-subtle px-2 py-1 text-text-main hover:bg-surface-hover" type="button" disabled={disabled} key={suggestion.suggestionId} onClick={() => void decide("session", suggestion.suggestionId)}>本会话允许此文件</button>)}
        {grantSuggestions.some((suggestion) => suggestion.selector.kind === "subtree") ? <button className="rounded-act-sm px-2 py-1 text-text-muted hover:bg-surface-subtle" type="button" aria-expanded={scopeOpen} onClick={() => setScopeOpen((value) => !value)}>选择目录范围</button> : null}
        {scopeOpen ? grantSuggestions.filter((suggestion) => suggestion.selector.kind === "subtree").map((suggestion) => <button className="mt-2 block max-w-full rounded-act-sm border border-line bg-surface-subtle px-2 py-1 text-left text-text-main hover:bg-surface-hover" type="button" disabled={disabled} key={suggestion.suggestionId} title={suggestion.selector.kind === "subtree" ? suggestion.selector.canonicalRoot : undefined} onClick={() => void decide("session", suggestion.suggestionId)}>本会话允许此目录树</button>) : null}
      </div> : null}

      <footer className={DIFF_APPROVAL_FOOTER_CLASS}>
        <button
          className={`${DIFF_ACTION_CLASS} ${DIFF_ACTION_GHOST_CLASS}`}
          type="button"
          disabled={disabled}
          onClick={() => decide("deny")}
        >
          {submitting === "deny" ? "Skipping..." : "Skip"}
        </button>
        <button
          className={`${DIFF_ACTION_CLASS} ${DIFF_ACTION_PRIMARY_CLASS}`}
          type="button"
          disabled={disabled}
          onClick={() => decide("once")}
        >
          {submitting === "once" ? "Allowing..." : "Allow"}
        </button>
      </footer>
    </article>
  );
}

export function FileDiffBlock({ message, className, onExpand }: { message: FileDiffMessage; className?: string; onExpand?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showFileChangeStats, setShowFileChangeStats] = useState(true);
  const actionLabel = message.kind === "write_diff" ? "Write" : "Edit";
  const isRunning = message.status === "running";
  const fileLabel = message.filePath || "file\u2026";
  const changeStats = showFileChangeStats && (message.additions > 0 || message.deletions > 0)
    ? ` · +${message.additions} -${message.deletions}`
    : "";

  useEffect(() => {
    let active = true;
    if (typeof window === "undefined" || !window.actspace?.getSettingsV4) return;
    void window.actspace.getSettingsV4().then((snapshot) => {
      if (active) setShowFileChangeStats(snapshot.settings.tools.showFileChangeStats !== false);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (message.status === "pending") {
    return <FileDiffApprovalCard message={message} actionLabel={actionLabel} className={className} />;
  }

  if (message.status === "denied") {
    return (
      <StatusLine
        className={className}
        isError
        text={`Denied ${actionLabel.toLowerCase()} ${fileLabel}`}
      />
    );
  }

  if (message.status === "failed") {
    return (
      <div className={className}>
        <StatusLine isError text={`${actionLabel} ${fileLabel}${changeStats} failed`} />
        {message.errorMessage ? (
          <div className={DIFF_ERROR_DETAIL_CLASS}>{message.errorMessage}</div>
        ) : null}
      </div>
    );
  }

  if (isRunning) {
    const progress = message.generationProgress;
    const characters = progress?.characters ?? 0;
    const amount = characters >= 1_000 ? `${(Math.floor(characters / 100) / 10).toFixed(1)} 千字符` : `${Math.floor(characters / 10) * 10} 字符`;
    const activity = progress?.phase === "saving" ? "正在保存"
      : progress?.phase === "preparing" ? "准备保存"
      : showFileChangeStats && characters >= 10 ? `已生成 ${amount}` : "正在生成";
    const text = `${actionLabel} ${fileLabel} · ${activity}`;
    return (
      <div className={`${TOOL_LOG_LINE_CLASS} ${TOOL_LOG_LINE_RUNNING_CLASS}${className ? ` ${className}` : ""}`}>
        <span
          className={`${TOOL_LOG_LINE_TEXT_CLASS} ${TOOL_LOG_LINE_TEXT_RUNNING_CLASS}`}
          {...getToolLogRunningTextAttrs(text)}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <article className={`file-diff-block${className ? ` ${className}` : ""}`}>
      <button
        className="file-diff-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => { if (!expanded) onExpand?.(); setExpanded((value) => !value); }}
      >
        <span className="file-diff-summary tool-summary-parts">
          <span className="tool-summary-action">{actionLabel}</span>{" "}<span className="tool-summary-target" title={message.filePath}>{message.filePath}</span>{showFileChangeStats && (message.additions > 0 || message.deletions > 0) ? (
            <>
              {" "}
              {message.additions > 0 ? <span className="diff-additions">+{message.additions}</span> : null}
              {message.additions > 0 && message.deletions > 0 ? " " : null}
              {message.deletions > 0 ? <span className="diff-deletions">-{message.deletions}</span> : null}
            </>
          ) : null}
        </span>
        {expanded
          ? <ChevronDown size={14} strokeWidth={2.2} />
          : <ChevronRight size={14} strokeWidth={2.2} />}
      </button>
      {expanded ? (
        <pre className="file-diff-content">
          {message.diff.split("\n").map((line, index) => (
            <span
              className={
                line.startsWith("+") ? "diff-line is-add"
                : line.startsWith("-") ? "diff-line is-remove"
                : "diff-line"
              }
              key={`${message.id}-${index}`}
            >
              {line || " "}
            </span>
          ))}
        </pre>
      ) : null}
    </article>
  );
}
