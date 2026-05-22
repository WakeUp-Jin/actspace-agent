import { useState } from "react";
import { ChevronDown, ChevronUp, Code2 } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

export function EditDiffBlock({ message }: { message: Extract<MessageBlock, { kind: "edit_diff" }> }) {
  const [expanded, setExpanded] = useState(false);
  const allLines = message.diff.split("\n");
  const lines = expanded ? allLines : allLines.slice(0, message.collapsedLines);

  return (
    <article className="diff-card">
      <header className="diff-card-header">
        <Code2 className="file-glyph" size={15} strokeWidth={2.1} aria-hidden="true" />
        <strong>{message.filePath}</strong>
        <span className="diff-additions">+{message.additions}</span>
        <span className="diff-deletions">-{message.deletions}</span>
      </header>
      <pre className="diff-preview">
        {lines.map((line, index) => (
          <span
            className={line.startsWith("+") ? "diff-line is-add" : line.startsWith("-") ? "diff-line is-remove" : "diff-line"}
            key={`${message.id}-${index}`}
          >
            {line || " "}
          </span>
        ))}
      </pre>
      <button
        className="diff-expand"
        type="button"
        aria-label={expanded ? "Collapse diff" : "Expand diff"}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <ChevronUp size={14} strokeWidth={2.2} /> : <ChevronDown size={14} strokeWidth={2.2} />}
      </button>
    </article>
  );
}
