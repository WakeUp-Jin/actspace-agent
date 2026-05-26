import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

type FileDiffMessage =
  | Extract<MessageBlock, { kind: "edit_diff" }>
  | Extract<MessageBlock, { kind: "write_diff" }>;

export function FileDiffBlock({ message }: { message: FileDiffMessage }) {
  const [expanded, setExpanded] = useState(false);
  const actionLabel = message.kind === "write_diff" ? "Write" : "Edit";
  const isRunning = message.status === "running";
  const fileLabel = message.filePath || "file\u2026";
  const streamingContent =
    message.kind === "write_diff" ? message.streamingContent : undefined;

  if (isRunning && streamingContent && streamingContent.length > 0) {
    return (
      <article className="file-diff-block is-streaming">
        <div className="file-diff-streaming-header">
          <span className="tool-log-line-text">
            {actionLabel} {fileLabel}
          </span>
        </div>
        <pre className="file-diff-content is-streaming-content">
          {streamingContent}
          <span className="streaming-cursor" aria-hidden />
        </pre>
      </article>
    );
  }

  if (isRunning) {
    return (
      <div className="tool-log-line is-running">
        <span className="tool-log-line-text">
          {actionLabel} {fileLabel}
        </span>
      </div>
    );
  }

  return (
    <article className="file-diff-block">
      <button
        className="file-diff-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="file-diff-summary">
          {actionLabel} {message.filePath}
          {message.additions > 0 ? (
            <>
              {" "}
              <span className="diff-additions">+{message.additions}</span>
            </>
          ) : null}
          {message.deletions > 0 ? (
            <>
              {" "}
              <span className="diff-deletions">-{message.deletions}</span>
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
