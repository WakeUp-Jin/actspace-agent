import { ChevronDown, ChevronRight, MoreHorizontal, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

type BashMessage = Extract<MessageBlock, { kind: "bash" }>;
type ApprovalDecision = "approve_once" | "deny" | "allow_similar";

const BASH_RUN_CLASS = "message-row bash-run max-w-[800px] px-[var(--conversation-text-inset)]";
const BASH_RUN_TOGGLE_CLASS =
  "bash-run-toggle inline-flex max-w-full items-center gap-[7px] border-0 bg-transparent p-0 text-left text-sm font-medium leading-[1.42] text-text-muted";
const BASH_COMMAND_PREVIEW_CLASS =
  "bash-command-preview overflow-hidden text-ellipsis whitespace-nowrap font-normal text-text-faint";
const BASH_OUTPUT_SHELL_CLASS =
  "bash-output-shell relative mt-[7px] max-h-[236px] overflow-auto rounded-act-md border border-line bg-surface-subtle";
const BASH_OUTPUT_MENU_CLASS =
  "bash-output-menu absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-act-sm border-0 bg-transparent text-text-faint transition-colors hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand";
const BASH_OUTPUT_TEXT_CLASS =
  "bash-output-text m-0 min-w-0 whitespace-pre-wrap pt-[10px] pr-[38px] pb-3 pl-[var(--conversation-card-padding)] font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.52] text-text-muted [word-break:break-word]";
const BASH_PROMPT_CLASS = "bash-prompt text-text-faint";
const BASH_APPROVAL_CLASS =
  "message-row bash-approval w-full max-w-[800px] overflow-hidden rounded-act-md border border-line bg-surface";
const BASH_APPROVAL_HEADER_CLASS =
  "bash-approval-header flex min-h-8 items-center justify-between border-b border-line py-0 pr-[9px] pl-[var(--conversation-card-padding)]";
const BASH_APPROVAL_TITLE_CLASS =
  "bash-approval-title inline-flex min-w-0 items-center gap-[7px] text-sm font-medium text-text-muted";
const BASH_APPROVAL_MENU_CLASS =
  "bash-approval-menu grid h-6 w-6 place-items-center rounded-act-sm border-0 bg-transparent text-text-faint transition-colors hover:bg-brand-soft hover:text-brand focus-visible:bg-brand-soft focus-visible:text-brand";
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
  "bash-action-soft bg-[#eeeff1] text-text-main hover:bg-[#e4e7eb] focus-visible:bg-[#e4e7eb] dark:bg-[#2f3237] dark:hover:bg-[#383b41] dark:focus-visible:bg-[#383b41]";
const BASH_ACTION_PRIMARY_CLASS =
  "bash-action-primary bg-[#2f83c9] text-white hover:bg-[#2676b8] focus-visible:bg-[#2676b8] dark:bg-[#3f93d6] dark:hover:bg-[#4f9fda] dark:focus-visible:bg-[#4f9fda]";

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

const FINAL_APPROVAL_STATUSES = new Set(["denied", "expired", "cancelled"]);

export function BashRunBlock({ message }: { message: BashMessage }) {
  if (message.status === "pending") {
    return <BashApprovalBlock message={message} />;
  }

  return <BashExecutionBlock message={message} />;
}

function BashExecutionBlock({ message }: { message: BashMessage }) {
  const [expanded, setExpanded] = useState(message.status === "failed");
  const chevron = expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />;
  const summary = getExecutionSummary(message);

  return (
    <article className={`${BASH_RUN_CLASS} is-${message.status}`}>
      <button
        className={BASH_RUN_TOGGLE_CLASS}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{summary}</span>
        {message.commandPreview ? <span className={BASH_COMMAND_PREVIEW_CLASS}>{message.commandPreview}</span> : null}
        {chevron}
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
            {message.exitCode !== undefined ? `\n# exit: ${message.exitCode}` : ""}
            {message.durationMs !== undefined ? ` (${message.durationMs}ms)` : ""}
            {message.stdout ? `\n\n${message.stdout.trimEnd()}` : ""}
            {message.stderr ? `\n\n${message.stderr.trimEnd()}` : ""}
            {message.reason && FINAL_APPROVAL_STATUSES.has(message.status) ? `\n\n${message.reason}` : ""}
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
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className={BASH_APPROVAL_MENU_CLASS} type="button" aria-label="Open approval actions">
              <MoreHorizontal size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>更多审批操作</TooltipContent>
        </Tooltip>
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
            {submitting === "deny" ? "Skipping..." : "Skip"}
          </button>
          <button
            className={`${BASH_ACTION_CLASS} ${BASH_ACTION_SOFT_CLASS}`}
            type="button"
            disabled={disabled}
            onClick={() => decide("allow_similar")}
          >
            {submitting === "allow_similar" ? "Allowing..." : "Allow"}
          </button>
          <button
            className={`${BASH_ACTION_CLASS} ${BASH_ACTION_PRIMARY_CLASS}`}
            type="button"
            disabled={disabled}
            onClick={() => decide("approve_once")}
          >
            {submitting === "approve_once" ? "Running..." : "Run"}
          </button>
        </div>
      </footer>
    </article>
  );
}

function getExecutionSummary(message: BashMessage): string {
  switch (message.status) {
    case "running":
      return `Running ${normalizeBashTitle(message.title)}`;
    case "failed":
      return `Failed ${normalizeBashTitle(message.title)}`;
    case "denied":
      return `Denied ${normalizeBashTitle(message.title)}`;
    case "expired":
      return `Expired ${normalizeBashTitle(message.title)}`;
    case "cancelled":
      return `Cancelled ${normalizeBashTitle(message.title)}`;
    case "success":
    default:
      return `Ran ${normalizeBashTitle(message.title)}`;
  }
}

function normalizeBashTitle(title: string): string {
  return title.replace(/\s+failed$/i, "");
}
