import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FilePlus, Pencil } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { ApprovalActions, ApprovalPath, ApprovalReason, ApprovalRow, useApprovalDecision, useExactGrantSuggestion } from "./ApprovalParts";
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

const DIFF_APPROVAL_STATS_CLASS =
  "file-diff-approval-stats inline-flex flex-none items-center gap-0.5 rounded-act-xs border-0 bg-transparent px-1 font-mono text-xs text-text-faint hover:bg-hover-overlay hover:text-text-main";
const DIFF_ERROR_DETAIL_CLASS =
  "file-diff-error-detail mx-[var(--conversation-text-inset)] mt-1 rounded-act-sm bg-surface-subtle px-[9px] py-[7px] font-mono text-xs leading-[1.55] text-text-muted [overflow-wrap:anywhere]";

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

function DiffLines({ message }: { message: FileDiffMessage }) {
  return (
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
  const [diffOpen, setDiffOpen] = useState(false);
  const suggestion = useExactGrantSuggestion(message.approvalRequestId);
  const decision = useApprovalDecision(message.approvalRequestId);
  const isWrite = message.kind === "write_diff";
  const hasStats = message.additions > 0 || message.deletions > 0;
  const canOpenDiff = hasStats && message.diff.trim().length > 0;

  if (decision.resolved === "deny") {
    return <StatusLine className={className} isError text={`Denied ${actionLabel.toLowerCase()} ${message.filePath}`} />;
  }
  if (decision.resolved) {
    return <StatusLine className={className} text={`${actionLabel} ${message.filePath}`} />;
  }

  const stats = hasStats ? <>
    {message.additions > 0 ? <span className="diff-additions">+{message.additions}</span> : null}
    {message.deletions > 0 ? <span className="diff-deletions">-{message.deletions}</span> : null}
  </> : null;

  return (
    <ApprovalRow
      className={className}
      icon={isWrite ? <FilePlus size={14} strokeWidth={2} /> : <Pencil size={14} strokeWidth={2} />}
      verb={isWrite ? "写入" : "编辑"}
      target={<ApprovalPath path={message.filePath} />}
      meta={<>
        {canOpenDiff ? (
          <button
            className={DIFF_APPROVAL_STATS_CLASS}
            type="button"
            aria-expanded={diffOpen}
            aria-label={diffOpen ? "收起改动" : "查看改动"}
            onClick={() => setDiffOpen((value) => !value)}
          >
            {stats}
            {diffOpen ? <ChevronDown size={12} strokeWidth={2.2} /> : <ChevronRight size={12} strokeWidth={2.2} />}
          </button>
        ) : stats ? <span className="inline-flex flex-none items-center font-mono text-xs">{stats}</span> : null}
        <ApprovalReason reason={message.reason} />
      </>}
      actions={<ApprovalActions state={decision} primaryLabel={isWrite ? "写入" : "应用"} suggestion={suggestion} />}
    >
      {diffOpen ? <div className="px-3 pb-2.5"><DiffLines message={message} /></div> : null}
    </ApprovalRow>
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
      {expanded ? <DiffLines message={message} /> : null}
    </article>
  );
}
