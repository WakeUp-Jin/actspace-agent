import { ChevronDown, ChevronRight, MoreHorizontal, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";

type BashMessage = Extract<MessageBlock, { kind: "bash" }>;

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
  const statusLabel = getStatusLabel(message);

  return (
    <article className={`message-row bash-run is-${message.status}`}>
      <button
        className="bash-run-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{statusLabel} {message.title}</span>
        {message.commandPreview ? <span className="bash-command-preview">{message.commandPreview}</span> : null}
        {chevron}
      </button>

      {expanded ? (
        <div className="bash-output-shell">
          <button className="bash-output-menu" type="button" aria-label="Open Bash output actions">
            <MoreHorizontal size={16} strokeWidth={2.2} />
          </button>
          <pre className="bash-output-text">
            <span className="bash-prompt">$ </span>{message.command}
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

  return (
    <article className="message-row bash-approval">
      <header className="bash-approval-header">
        <span className="bash-approval-title">
          <TerminalSquare size={14} strokeWidth={2} aria-hidden="true" />
          {message.title}
        </span>
        <button className="bash-approval-menu" type="button" aria-label="Open approval actions">
          <MoreHorizontal size={15} strokeWidth={2.1} />
        </button>
      </header>

      <pre className="bash-approval-command">
        <span className="bash-prompt">$ </span>{message.command}
      </pre>

      {message.reason ? (
        <div className="bash-approval-reason">
          <strong>Reason:</strong> {message.reason}
        </div>
      ) : null}

      {detailsOpen ? (
        <div className="bash-approval-details">
          {message.cwd ? <div>cwd: {message.cwd}</div> : null}
          {message.commandPreview ? <div>prefix: {message.commandPreview}</div> : null}
        </div>
      ) : null}

      <footer className="bash-approval-footer">
        <button
          className="bash-policy-button"
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {message.policyLabel ?? "Allowlist"}
          {detailsOpen ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
        </button>
        <div className="bash-approval-actions">
          <button className="bash-action bash-action-ghost" type="button">Skip</button>
          <button className="bash-action bash-action-soft" type="button">Allow</button>
          <button className="bash-action bash-action-primary" type="button">Run</button>
        </div>
      </footer>
    </article>
  );
}

function getStatusLabel(message: BashMessage): string {
  switch (message.status) {
    case "running":
      return "Running";
    case "failed":
      return "Ran";
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
