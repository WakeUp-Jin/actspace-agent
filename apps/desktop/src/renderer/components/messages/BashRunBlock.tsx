import { ChevronDown, ChevronRight, MoreHorizontal, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { TOOL_LOG_LINE_TEXT_RUNNING_CLASS, getToolLogRunningTextAttrs } from "./toolLogStyles";

type BashMessage = Extract<MessageBlock, { kind: "bash" }>;
type ApprovalDecision = "once" | "deny";

const BASH_RUN_CLASS = "message-row bash-run max-w-[800px] px-[var(--conversation-text-inset)]";
const BASH_RUN_TOGGLE_CLASS =
  "bash-run-toggle flex w-full max-w-full items-center gap-[7px] overflow-hidden border-0 bg-transparent p-0 text-left text-sm font-normal leading-[22px] text-text-muted";
const BASH_RUN_SUMMARY_CLASS = "bash-run-summary flex-none whitespace-nowrap";
const BASH_COMMAND_PREVIEW_CLASS =
  "bash-command-preview min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-text-faint";
const BASH_RUN_TRAILING_CLASS = "bash-run-trailing inline-flex flex-none items-center gap-[7px]";
const BASH_OUTPUT_SHELL_CLASS =
  "bash-output-shell relative mt-[7px] max-h-[236px] overflow-auto rounded-act-md border border-line bg-surface-subtle";
const BASH_OUTPUT_MENU_CLASS =
  "bash-output-menu absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-act-sm border-0 bg-transparent text-text-faint transition-colors hover:bg-hover-overlay hover:text-text-main focus-visible:bg-selected focus-visible:text-text-main";
const BASH_OUTPUT_TEXT_CLASS =
  "bash-output-text m-0 min-w-0 whitespace-pre-wrap pt-[10px] pr-[38px] pb-3 pl-[var(--conversation-card-padding)] font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.6] text-text-muted [word-break:break-word]";
const BASH_PROMPT_CLASS = "bash-prompt text-text-faint";
const BASH_APPROVAL_CLASS =
  "message-row bash-approval w-full max-w-[800px] overflow-hidden rounded-act-md border border-line bg-surface";
const BASH_APPROVAL_HEADER_CLASS =
  "bash-approval-header flex min-h-8 items-center justify-between border-b border-line py-0 pr-[9px] pl-[var(--conversation-card-padding)]";
const BASH_APPROVAL_TITLE_CLASS =
  "bash-approval-title inline-flex min-w-0 items-center gap-[7px] text-sm font-medium text-text-muted";
const BASH_INTENT_COMMENT_CLASS =
  "bash-intent-comment font-mono text-[length:var(--act-font-mono-size,13px)] italic leading-[1.55] text-text-faint";
const BASH_INTENT_BLOCK_CLASS =
  "bash-intent-comment--block px-[var(--conversation-card-padding)] pt-[9px] [overflow-wrap:anywhere] break-words";
const BASH_APPROVAL_COMMAND_CLASS =
  "bash-approval-command m-0 whitespace-pre-wrap border-b border-line px-[var(--conversation-card-padding)] py-[9px] font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.55] text-text-muted [overflow-wrap:anywhere]";
const BASH_APPROVAL_REASON_CLASS =
  "bash-approval-reason px-[var(--conversation-card-padding)] pt-2 text-[13px] leading-[1.45] text-text-muted";
const BASH_APPROVAL_REASON_LABEL_CLASS = "font-semibold text-text-faint";
const BASH_APPROVAL_DETAILS_CLASS =
  "bash-approval-details break-all px-[var(--conversation-card-padding)] pt-[7px] font-mono text-xs leading-[1.45] text-text-faint";
const BASH_APPROVAL_FOOTER_CLASS =
  "bash-approval-footer flex min-h-[46px] items-center justify-between gap-3 pt-[7px] pr-[10px] pb-[9px] pl-[var(--conversation-card-padding)]";
const BASH_POLICY_BUTTON_CLASS =
  "bash-policy-button inline-flex min-w-0 items-center gap-[5px] border-0 bg-transparent p-0 text-[13px] text-text-muted";
const BASH_APPROVAL_ACTIONS_CLASS = "bash-approval-actions flex flex-none items-center gap-1.5";
const BASH_ACTION_CLASS =
  "bash-action h-7 min-w-0 rounded-act-sm border-0 px-[9px] text-[13px] font-medium";
const BASH_ACTION_GHOST_CLASS =
  "bash-action-ghost bg-transparent text-text-muted hover:bg-surface-subtle focus-visible:bg-surface-subtle";
const BASH_ACTION_SOFT_CLASS =
  "bash-action-soft bg-surface-subtle text-text-main hover:bg-hover-overlay focus-visible:bg-selected";
const BASH_ACTION_PRIMARY_CLASS =
  "bash-action-primary bg-action text-on-action hover:bg-action-hover focus-visible:bg-action-hover";

async function submitApproval(requestId: string, decision: ApprovalDecision): Promise<boolean> {
  if (typeof window === "undefined" || !window.actspace?.submitApproval) {
    console.warn("submitApproval bridge unavailable");
    return false;
  }
  try {
    await window.actspace.submitApproval({ requestId, decision });
    return true;
  } catch (error) {
    console.error("Failed to submit approval", error);
    return false;
  }
}


export function BashRunBlock({ message, replyCompleted = false, onExpand }: { message: BashMessage; replyCompleted?: boolean; onExpand?: () => void }) {
  if (message.status === "pending") {
    return <BashApprovalBlock message={message} />;
  }

  return <BashExecutionBlock message={message} replyCompleted={replyCompleted} onExpand={onExpand} />;
}

const BASH_BACKGROUND_BADGE_CLASS =
  "bash-background-badge inline-flex flex-none items-center rounded-act-sm border border-line bg-surface-subtle px-1.5 py-px text-xs font-medium text-text-faint";

const BACKGROUND_BADGE_TEXT: Record<NonNullable<BashMessage["backgroundStatus"]>, string> = {
  running: "后台运行中",
  completed: "后台完成",
  failed: "后台失败",
  killed: "已终止",
  stalled: "疑似等待输入",
};

// 沙盒标签：沙盒是默认态弱化显示；真实环境是例外态，醒目提示用户命令未受沙盒约束
const BASH_SANDBOX_BADGE_CLASS =
  "bash-sandbox-badge inline-flex flex-none items-center rounded-act-sm border border-line bg-surface-subtle px-1.5 py-px text-xs font-medium text-text-faint";
const BASH_REAL_ENV_BADGE_CLASS =
  "bash-real-env-badge inline-flex flex-none items-center rounded-act-sm border border-line bg-warning-soft px-1.5 py-px text-xs font-medium text-on-warning";
const BASH_NOT_EXECUTED_BADGE_CLASS =
  "bash-not-executed-badge inline-flex flex-none items-center rounded-act-sm border border-line bg-surface-subtle px-1.5 py-px text-xs font-medium text-text-faint";

function EnvironmentBadge({ sandboxed, notExecuted }: Pick<BashMessage, "sandboxed" | "notExecuted">) {
  if (notExecuted) {
    return <span className={BASH_NOT_EXECUTED_BADGE_CLASS}>未执行</span>;
  }
  if (sandboxed === undefined) return null;
  if (sandboxed) {
    return <span className={BASH_SANDBOX_BADGE_CLASS}>沙盒</span>;
  }
  return <span className={BASH_REAL_ENV_BADGE_CLASS}>真实环境</span>;
}

function BashExecutionBlock({ message, replyCompleted = false, onExpand }: { message: BashMessage; replyCompleted?: boolean; onExpand?: () => void }) {
  const [expanded, setExpanded] = useState(!replyCompleted && message.status === "failed");
  const chevron = expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />;
  const summary = getExecutionSummary(message);
  const target = message.commandPreview || message.command || "Bash command";
  // 前台执行中 / 后台仍在跑：标题走 shimmer 高光，让用户看出命令正在执行
  const isActive =
    message.status === "running" &&
    (message.backgroundStatus === undefined || message.backgroundStatus === "running");

  return (
    <article className={`${BASH_RUN_CLASS} is-${message.status}`}>
      <button
        className={`${BASH_RUN_TOGGLE_CLASS}${["failed", "denied", "expired"].includes(message.status) ? " text-on-danger" : ""}`}
        type="button"
        aria-expanded={expanded}
        onClick={() => { if (!expanded) onExpand?.(); setExpanded((value) => !value); }}
      >
        {isActive ? (
          <span
            className={`${BASH_RUN_SUMMARY_CLASS} ${TOOL_LOG_LINE_TEXT_RUNNING_CLASS}`}
            {...getToolLogRunningTextAttrs(summary)}
          >
            {summary}
          </span>
        ) : (
          <span className={BASH_RUN_SUMMARY_CLASS}>{summary}</span>
        )}
        <span className={BASH_COMMAND_PREVIEW_CLASS} title={target}>{target}</span>
        <span className={BASH_RUN_TRAILING_CLASS}>
          <EnvironmentBadge sandboxed={message.sandboxed === false ? false : undefined} notExecuted={message.notExecuted} />
          {message.backgroundStatus ? (
            <span className={BASH_BACKGROUND_BADGE_CLASS}>{BACKGROUND_BADGE_TEXT[message.backgroundStatus]}</span>
          ) : null}
          {chevron}
        </span>
      </button>

      {expanded ? (
        <div className={BASH_OUTPUT_SHELL_CLASS}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={BASH_OUTPUT_MENU_CLASS} type="button" aria-label="Open Bash output actions">
                <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>更多 Bash 输出操作</TooltipContent>
          </Tooltip>
          <pre className={BASH_OUTPUT_TEXT_CLASS}>
            {message.intent ? (
              <span className={BASH_INTENT_COMMENT_CLASS}># {message.intent}{"\n"}</span>
            ) : null}
            <span className={BASH_PROMPT_CLASS}>$ </span>{message.command}
            {message.cwd ? `\n# cwd: ${message.cwd}` : ""}
            {message.backgroundTaskId ? `\n# task: ${message.backgroundTaskId}` : ""}
            {message.outputFilePath ? `\n# output: ${message.outputFilePath}` : ""}
            {!message.notExecuted && message.exitCode != null ? `\n# exit: ${message.exitCode}` : ""}
            {!message.notExecuted && message.durationMs !== undefined ? `\n# duration: ${message.durationMs}ms` : ""}
            {message.notExecuted ? "\n# 未执行" : message.sandboxed === undefined ? "" : `\n# environment: ${message.sandboxed ? "沙盒" : "真实环境"}`}
            {message.title && message.title !== "Bash command" && message.title !== message.intent ? `\n# summary: ${message.title}` : ""}
            {!message.notExecuted && message.stdout ? `\n\n${message.stdout.trimEnd()}` : ""}
            {!message.notExecuted && message.stderr ? `\n\n${message.stderr.trimEnd()}` : ""}
            {message.reason ? `\n\n${message.reason}` : ""}
          </pre>
        </div>
      ) : null}
    </article>
  );
}

function BashApprovalBlock({ message }: { message: BashMessage }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submitting, setSubmitting] = useState<ApprovalDecision | null>(null);
  const [resolvedDecision, setResolvedDecision] = useState<ApprovalDecision | null>(null);

  const requestId = message.approvalRequestId;
  const disabled = !requestId || submitting !== null;

  const decide = async (decision: ApprovalDecision) => {
    if (!requestId || submitting !== null) return;
    setSubmitting(decision);
    const submitted = await submitApproval(requestId, decision);
    if (submitted) {
      setResolvedDecision(decision);
    } else {
      setSubmitting(null);
    }
  };

  if (resolvedDecision) {
    return (
      <BashExecutionBlock
        message={{
          ...message,
          status: resolvedDecision === "deny" ? "denied" : "running",
          approvalRequestId: undefined,
          sandboxed: resolvedDecision === "deny" ? undefined : message.sandboxed,
          notExecuted: resolvedDecision === "deny" ? true : undefined,
        }}
      />
    );
  }

  return (
    <article className={BASH_APPROVAL_CLASS}>
      <header className={BASH_APPROVAL_HEADER_CLASS}>
        <span className={BASH_APPROVAL_TITLE_CLASS}>
          <TerminalSquare className="text-text-faint" size={14} strokeWidth={2} aria-hidden="true" />
          {message.title}
          <EnvironmentBadge sandboxed={message.sandboxed} notExecuted={message.notExecuted} />
        </span>
      </header>

      {message.intent ? (
        <div className={`${BASH_INTENT_COMMENT_CLASS} ${BASH_INTENT_BLOCK_CLASS}`}>
          <span className={BASH_PROMPT_CLASS}># </span>{message.intent}
        </div>
      ) : null}

      <pre className={BASH_APPROVAL_COMMAND_CLASS}>
        <span className={BASH_PROMPT_CLASS}>$ </span>{message.command}
      </pre>

      {message.reason ? (
        <div className={BASH_APPROVAL_REASON_CLASS}>
          <strong className={BASH_APPROVAL_REASON_LABEL_CLASS}>Reason:</strong> {message.reason}
        </div>
      ) : null}

      {detailsOpen ? (
        <div className={BASH_APPROVAL_DETAILS_CLASS}>
          {message.cwd ? <div>cwd: {message.cwd}</div> : null}
          {message.commandPreview ? <div>prefix: {message.commandPreview}</div> : null}
        </div>
      ) : null}

      <footer className={BASH_APPROVAL_FOOTER_CLASS}>
        <button
          className={BASH_POLICY_BUTTON_CLASS}
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {message.policyLabel ?? "Allowlist"}
          {detailsOpen ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
        </button>
        <div className={BASH_APPROVAL_ACTIONS_CLASS}>
          <button
            className={`${BASH_ACTION_CLASS} ${BASH_ACTION_GHOST_CLASS}`}
            type="button"
            disabled={disabled}
            onClick={() => decide("deny")}
          >
            {submitting === "deny" ? "正在拒绝…" : "拒绝"}
          </button>
          <button
            className={`${BASH_ACTION_CLASS} ${BASH_ACTION_PRIMARY_CLASS}`}
            type="button"
            disabled={disabled}
            onClick={() => decide("once")}
          >
            {submitting === "once" ? "正在运行…" : "运行一次"}
          </button>
        </div>
      </footer>
    </article>
  );
}

function getExecutionSummary(message: BashMessage): string {
  switch (message.status) {
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    case "cancelled":
      return "Cancelled";
    case "success":
    default:
      return "Ran";
  }
}
