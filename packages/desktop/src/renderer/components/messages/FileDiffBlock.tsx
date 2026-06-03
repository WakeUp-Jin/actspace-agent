import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import {
  getToolLogRunningTextAttrs,
  TOOL_LOG_LINE_CLASS,
  TOOL_LOG_LINE_RUNNING_CLASS,
  TOOL_LOG_LINE_TEXT_CLASS,
  TOOL_LOG_LINE_TEXT_RUNNING_CLASS,
} from "./toolLogStyles";

type FileDiffMessage =
  | Extract<MessageBlock, { kind: "edit_diff" }>
  | Extract<MessageBlock, { kind: "write_diff" }>;

export function FileDiffBlock({ message, className }: { message: FileDiffMessage; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const actionLabel = message.kind === "write_diff" ? "Write" : "Edit";
  const isRunning = message.status === "running";
  const fileLabel = message.filePath || "file\u2026";
  const streamingContent =
    message.kind === "write_diff" ? message.streamingContent : undefined;

  if (isRunning && streamingContent && streamingContent.length > 0) {
    return (
      <article className={`file-diff-block is-streaming${className ? ` ${className}` : ""}`}>
        <div className="file-diff-streaming-header">
          <span className={TOOL_LOG_LINE_TEXT_CLASS}>
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
    const text = `${actionLabel} ${fileLabel}`;
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
