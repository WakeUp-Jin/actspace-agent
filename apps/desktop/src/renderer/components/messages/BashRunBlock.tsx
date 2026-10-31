import { ChevronDown, ChevronRight, MoreHorizontal, ShieldCheck, ShieldOff, TerminalSquare } from "lucide-react";
import { createContext, useContext, useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { ApprovalActions, ApprovalCard, getCommandPrefixGrant, useApprovalDecision, useCommandPrefixGrantSuggestion } from "./ApprovalParts";
import { getShellCommandHeads, tokenizeShellCommand, type ShellTokenKind } from "./shell-highlight";
import { TOOL_LOG_LINE_TEXT_RUNNING_CLASS, getToolLogRunningTextAttrs } from "./toolLogStyles";

type BashMessage = Extract<MessageBlock, { kind: "bash" }>;

const BASH_RUN_CLASS = "message-row bash-run max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)]";
const BASH_RUN_TOGGLE_CLASS =
  "bash-run-toggle flex w-full max-w-full items-center gap-[7px] overflow-hidden border-0 bg-transparent p-0 text-left text-act-md font-normal leading-[22px] text-text-muted";
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
const BASH_APPROVAL_INTENT_CLASS = "min-w-0 truncate text-text-muted";
const BASH_APPROVAL_HEADS_CLASS = "bash-approval-heads min-w-0 shrink-[2] truncate";
// act-code-hl 提供随主题翻转的语法色（markdown.css）；命令名用红橙、连接符用蓝，接近终端里的常见配色。
const BASH_APPROVAL_COMMAND_CLASS =
  "bash-approval-command act-code-hl m-0 max-h-[168px] overflow-auto whitespace-pre-wrap px-3 pt-2.5 pb-0.5 font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.6] text-text-main [overflow-wrap:anywhere]";
// 申请出沙箱的理由：命令下面一行次要文字，和底部的「真实环境」一起说明为什么要离开沙盒。
const BASH_APPROVAL_JUSTIFICATION_CLASS =
  "bash-approval-justification m-0 px-3 pt-1 pb-0.5 text-act-sm leading-[1.5] text-text-muted [overflow-wrap:anywhere]";
const SHELL_TOKEN_CLASS: Record<ShellTokenKind, string | undefined> = {
  command: "text-(--md-hl-variable)",
  operator: "text-(--md-hl-function)",
  string: "text-(--md-hl-string)",
  flag: "text-text-muted",
  text: undefined,
};

export function BashRunBlock({ message, replyCompleted = false, onExpand }: { message: BashMessage; replyCompleted?: boolean; onExpand?: () => void }) {
  if (message.status === "pending") {
    return <BashApprovalBlock message={message} />;
  }

  return <BashExecutionBlock message={message} replyCompleted={replyCompleted} onExpand={onExpand} />;
}

/** 后台 Bash 与后台子 Agent 共用的「后台」标签；状态仍由卡片自身的状态表达。 */
export const BACKGROUND_TAG_CLASS =
  "background-tag inline-flex flex-none items-center rounded-act-sm border border-line bg-surface-subtle px-1.5 py-px text-act-xs leading-4 font-medium text-text-faint";

export function BackgroundTag() {
  return <span className={BACKGROUND_TAG_CLASS}>后台</span>;
}

/** 点 bash 行的「后台」标签打开右侧「后台任务」并选中这条命令。只有主会话的消息流提供；没有时标签只是文字。 */
export const BackgroundTaskLinkContext = createContext<((taskId: string) => void) | undefined>(undefined);
const BACKGROUND_TAG_LINK_CLASS =
  "cursor-pointer transition-colors hover:border-line-strong hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";

// 执行环境只用图标表示：沙盒是打勾的盾牌；真实环境是划掉的盾牌，警示色提示命令未受沙盒约束。
// 文字说明放在 aria-label / title 里，悬停可见。
const SANDBOX_TITLE = "沙盒：命令在沙盒内运行";
const REAL_ENV_TITLE = "真实环境：命令在沙盒外运行，可以访问整台电脑的文件和网络";
const BASH_SANDBOX_ICON_CLASS = "bash-sandbox-badge inline-flex flex-none items-center text-success";
const BASH_REAL_ENV_ICON_CLASS = "bash-real-env-badge inline-flex flex-none items-center text-on-warning";
const BASH_NOT_EXECUTED_BADGE_CLASS =
  "bash-not-executed-badge inline-flex flex-none items-center rounded-act-sm border border-line bg-surface-subtle px-1.5 py-px text-act-xs leading-4 font-medium text-text-faint";

export function EnvironmentIcon({ sandboxed, className = "" }: { sandboxed: boolean; className?: string }) {
  const Icon = sandboxed ? ShieldCheck : ShieldOff;
  const title = sandboxed ? SANDBOX_TITLE : REAL_ENV_TITLE;
  return (
    <span
      className={`${sandboxed ? BASH_SANDBOX_ICON_CLASS : BASH_REAL_ENV_ICON_CLASS}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={sandboxed ? "沙盒" : "真实环境"}
      title={title}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

function EnvironmentBadge({ sandboxed, notExecuted }: Pick<BashMessage, "sandboxed" | "notExecuted">) {
  if (notExecuted) {
    return <span className={BASH_NOT_EXECUTED_BADGE_CLASS}>未执行</span>;
  }
  if (sandboxed === undefined) return null;
  return <EnvironmentIcon sandboxed={sandboxed} />;
}

function BashExecutionBlock({ message, replyCompleted = false, onExpand }: { message: BashMessage; replyCompleted?: boolean; onExpand?: () => void }) {
  const [expanded, setExpanded] = useState(!replyCompleted && message.status === "failed");
  const chevron = expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />;
  const summary = getExecutionSummary(message);
  const target = message.commandPreview || message.command || "Bash command";
  // 前台执行中 / 后台仍在跑：标题走 shimmer 高光，让用户看出命令正在执行
  const isActive = message.status === "running";
  const openBackgroundTask = useContext(BackgroundTaskLinkContext);
  const backgroundTaskId = message.background ? message.backgroundTaskId : undefined;
  // 标签可点时不能嵌在展开按钮里，挪到按钮后面并排。
  const backgroundLink = backgroundTaskId && openBackgroundTask
    ? (
      <button
        type="button"
        className={`${BACKGROUND_TAG_CLASS} ${BACKGROUND_TAG_LINK_CLASS}`}
        title="在右侧「后台任务」里查看输出"
        onClick={() => openBackgroundTask(backgroundTaskId)}
      >
        后台
      </button>
    )
    : null;

  const toggle = (
    <button
      className={`${BASH_RUN_TOGGLE_CLASS}${backgroundLink ? " min-w-0 flex-1" : ""}${["failed", "denied", "expired"].includes(message.status) ? " text-on-danger" : ""}`}
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
        <EnvironmentBadge sandboxed={message.sandboxed} notExecuted={message.notExecuted} />
        {message.background && !backgroundLink ? <BackgroundTag /> : null}
        {chevron}
      </span>
    </button>
  );

  return (
    <article className={`${BASH_RUN_CLASS} is-${message.status}`}>
      {backgroundLink ? <div className="flex items-center gap-[7px]">{toggle}{backgroundLink}</div> : toggle}

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
  const suggestion = useCommandPrefixGrantSuggestion(message.approvalRequestId);

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

  const heads = getShellCommandHeads(message.command).join(", ");
  return (
    <ApprovalCard
      icon={<TerminalSquare size={14} strokeWidth={2} />}
      target={<>
        <span className={BASH_APPROVAL_INTENT_CLASS} title={message.intent}>{message.intent || "Bash 命令"}</span>
        {heads ? <span className={BASH_APPROVAL_HEADS_CLASS}>{heads}</span> : null}
      </>}
      divided
      footerMeta={<BashApprovalEnvironment sandboxed={message.sandboxed} cwd={message.cwd} />}
      actions={<ApprovalActions
        state={decision}
        primaryLabel="运行"
        suggestion={suggestion}
        sessionDetail={suggestion ? getCommandPrefixGrant(suggestion) ?? undefined : undefined}
      />}
    >
      <pre className={BASH_APPROVAL_COMMAND_CLASS}>
        <span className={`${BASH_PROMPT_CLASS} select-none`}>$ </span>
        {tokenizeShellCommand(message.command).map((token, index) => {
          const className = SHELL_TOKEN_CLASS[token.kind];
          return className ? <span key={index} className={className}>{token.text}</span> : token.text;
        })}
      </pre>
      {message.justification ? <p className={BASH_APPROVAL_JUSTIFICATION_CLASS}>{message.justification}</p> : null}
    </ApprovalCard>
  );
}

/** 底部左侧：执行环境（沙盒 / 真实环境），模型显式指定了工作目录时再跟上 cwd。 */
function BashApprovalEnvironment({ sandboxed, cwd }: Pick<BashMessage, "sandboxed" | "cwd">) {
  const showCwd = Boolean(cwd && cwd !== "." && cwd !== "./");
  if (sandboxed === undefined && !showCwd) return null;
  return <>
    {sandboxed === undefined ? null : <EnvironmentIcon sandboxed={sandboxed} className="bash-approval-environment" />}
    {sandboxed !== undefined && showCwd ? <span aria-hidden="true">·</span> : null}
    {showCwd ? <code className="min-w-0 truncate font-mono" title={cwd}>{cwd}</code> : null}
  </>;
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
