import { ChevronDown, ChevronRight, MoreHorizontal, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { ApprovalActions, ApprovalCard, ApprovalReason, useApprovalDecision } from "./ApprovalParts";
import { TOOL_LOG_LINE_TEXT_RUNNING_CLASS, getToolLogRunningTextAttrs } from "./toolLogStyles";

type BashMessage = Extract<MessageBlock, { kind: "bash" }>;

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
const BASH_INTENT_COMMENT_CLASS =
  "bash-intent-comment font-mono text-[length:var(--act-font-mono-size,13px)] italic leading-[1.55] text-text-faint";
const BASH_APPROVAL_INTENT_CLASS = "min-w-0 truncate text-text-main";
const BASH_APPROVAL_COMMAND_CLASS =
  "bash-approval-command m-0 whitespace-pre-wrap rounded-act-sm bg-surface-subtle px-3 py-2 font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.55] text-text-main [overflow-wrap:anywhere]";

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
  const decision = useApprovalDecision(message.approvalRequestId);

  if (decision.resolved) {
    const denied = decision.resolved === "deny";
    return (
      <BashExecutionBlock
        message={{
          ...message,
          status: denied ? "denied" : "running",
          approvalRequestId: undefined,
          sandboxed: denied ? undefined : message.sandboxed,
          notExecuted: denied ? true : undefined,
        }}
      />
    );
  }

  return (
    <ApprovalCard
      icon={<TerminalSquare size={14} strokeWidth={2} />}
      verb="运行"
      target={<span className={BASH_APPROVAL_INTENT_CLASS} title={message.intent}>{message.intent || "Bash 命令"}</span>}
      meta={<>
        <EnvironmentBadge sandboxed={message.sandboxed} notExecuted={message.notExecuted} />
        <ApprovalReason reason={message.reason} />
      </>}
      footerMeta={message.cwd ? <span title={message.cwd}>cwd <code className="font-mono">{message.cwd}</code></span> : null}
      actions={<ApprovalActions state={decision} primaryLabel="运行" size="card" />}
    >
      <pre className={BASH_APPROVAL_COMMAND_CLASS}>
        <span className={BASH_PROMPT_CLASS}>$ </span>{message.command}
      </pre>
    </ApprovalCard>
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
