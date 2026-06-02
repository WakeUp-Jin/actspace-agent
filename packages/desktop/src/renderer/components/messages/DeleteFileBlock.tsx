import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogLine } from "./ToolLogLine";

type DeleteMessage = Extract<MessageBlock, { kind: "delete" }>;
type DeleteDecision = "approve_once" | "deny";

const DELETE_APPROVAL_CLASS =
  "message-row delete-approval w-full max-w-[800px] overflow-hidden rounded-act-md border border-line bg-surface";
const DELETE_APPROVAL_HEADER_CLASS =
  "delete-approval-header flex min-h-8 items-center justify-between border-b border-line py-0 pr-[9px] pl-[var(--conversation-card-padding)]";
const DELETE_APPROVAL_TITLE_CLASS =
  "delete-approval-title min-w-0 text-sm font-medium text-text-muted";
const DELETE_APPROVAL_TARGET_CLASS =
  "delete-approval-target border-b border-line bg-surface-subtle px-[var(--conversation-card-padding)] py-[9px] font-mono text-[length:var(--act-font-mono-size,13px)] leading-[1.55] text-text-muted [overflow-wrap:anywhere]";
const DELETE_APPROVAL_REASON_CLASS =
  "delete-approval-reason px-[var(--conversation-card-padding)] pt-2 text-[13px] leading-[1.45] text-text-muted";
const DELETE_APPROVAL_REASON_LABEL_CLASS = "font-semibold text-text-faint";
const DELETE_APPROVAL_FOOTER_CLASS =
  "delete-approval-footer flex min-h-[46px] items-center justify-end gap-1.5 pt-[7px] pr-[10px] pb-[9px] pl-[var(--conversation-card-padding)]";
const DELETE_ACTION_CLASS =
  "delete-action h-7 min-w-0 rounded-act-sm border-0 px-[9px] text-[13px] font-medium";
const DELETE_ACTION_GHOST_CLASS =
  "delete-action-ghost bg-transparent text-text-muted hover:bg-surface-subtle focus-visible:bg-surface-subtle";
const DELETE_ACTION_DANGER_CLASS =
  "delete-action-danger border border-on-danger/30 bg-danger-soft text-on-danger hover:border-on-danger/50 focus-visible:border-on-danger/50";

async function submitDeleteApproval(requestId: string, decision: DeleteDecision): Promise<boolean> {
  if (typeof window === "undefined" || !window.actspace?.submitApproval) {
    console.warn("submitApproval bridge unavailable");
    return false;
  }
  try {
    const result = await window.actspace.submitApproval({ requestId, decision });
    if (!result.ok) {
      console.warn("Delete approval was not accepted", result.reason);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to submit delete approval", error);
    return false;
  }
}

export function DeleteFileBlock({ message, className }: { message: DeleteMessage; className?: string }) {
  const [submitting, setSubmitting] = useState<DeleteDecision | null>(null);
  const [resolvedDecision, setResolvedDecision] = useState<DeleteDecision | null>(null);

  const requestId = message.approvalRequestId;
  const disabled = !requestId || submitting !== null;

  const decide = async (decision: DeleteDecision) => {
    if (!requestId || submitting !== null) return;
    setSubmitting(decision);
    const submitted = await submitDeleteApproval(requestId, decision);
    if (submitted) {
      setResolvedDecision(decision);
    } else {
      setSubmitting(null);
    }
  };

  if (resolvedDecision) {
    return (
      <ToolLogLine
        message={{
          ...message,
          status: resolvedDecision === "deny" ? "denied" : "running",
          displayText: resolvedDecision === "deny"
            ? `Denied delete ${message.filePath}`
            : `Delete ${message.filePath}`,
          isError: resolvedDecision === "deny",
          approvalRequestId: undefined,
        }}
      />
    );
  }

  return (
    <article className={`${DELETE_APPROVAL_CLASS}${className ? ` ${className}` : ""}`}>
      <header className={DELETE_APPROVAL_HEADER_CLASS}>
        <span className={DELETE_APPROVAL_TITLE_CLASS}>Delete file requires approval</span>
      </header>

      <div className={DELETE_APPROVAL_TARGET_CLASS}>{message.filePath}</div>

      {message.reason ? (
        <div className={DELETE_APPROVAL_REASON_CLASS}>
          <strong className={DELETE_APPROVAL_REASON_LABEL_CLASS}>Reason:</strong> {message.reason}
        </div>
      ) : null}

      <footer className={DELETE_APPROVAL_FOOTER_CLASS}>
        <button
          className={`${DELETE_ACTION_CLASS} ${DELETE_ACTION_GHOST_CLASS}`}
          type="button"
          disabled={disabled}
          onClick={() => decide("deny")}
        >
          {submitting === "deny" ? "Skipping..." : "Skip"}
        </button>
        <button
          className={`${DELETE_ACTION_CLASS} ${DELETE_ACTION_DANGER_CLASS}`}
          type="button"
          disabled={disabled}
          onClick={() => decide("approve_once")}
        >
          {submitting === "approve_once" ? "Deleting..." : "Delete"}
        </button>
      </footer>
    </article>
  );
}
