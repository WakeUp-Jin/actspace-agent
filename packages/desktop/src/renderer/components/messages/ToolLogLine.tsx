import { Globe } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

type ToolLogMessage = Extract<MessageBlock, {
  kind: "read" | "search" | "grep" | "glob" | "web_search" | "directory_list" | "tool" | "error";
}>;

function WebSearch({ message }: { message: Extract<MessageBlock, { kind: "web_search" }> }) {
  return (
    <div className={`tool-log-line web-search${message.status === "running" ? " is-running" : ""}`}>
      <Globe size={14} strokeWidth={2} aria-hidden="true" />
      <span>{message.displayText}</span>
    </div>
  );
}

export function ToolLogLine({ message }: { message: ToolLogMessage }) {
  if (message.kind === "read") {
    return <div className={`tool-log-line${message.status === "running" ? " is-running" : ""}`}>Read {message.filePath} {message.range ?? ""}</div>;
  }

  if (message.kind === "search") {
    return (
      <div className={`tool-log-line${message.status === "running" ? " is-running" : ""}`}>
        Searched files {message.scope ? `${message.scope} ` : ""}for {message.query}
      </div>
    );
  }

  if (message.kind === "grep") {
    return (
      <div className={`tool-log-line${message.status === "running" ? " is-running" : ""}`}>
        Grep {message.pattern}{message.scope ? ` in ${message.scope}` : ""}
      </div>
    );
  }

  if (message.kind === "glob") {
    return (
      <div className={`tool-log-line${message.status === "running" ? " is-running" : ""}`}>
        Glob {message.pattern}{message.scope ? ` in ${message.scope}` : ""}
      </div>
    );
  }

  if (message.kind === "web_search") {
    return <WebSearch message={message} />;
  }

  if (message.kind === "directory_list") {
    return (
      <div className={`tool-log-line${message.status === "running" ? " is-running" : ""}`}>
        Listed {message.path}{message.entryCount !== undefined ? ` (${message.entryCount} entries)` : ""}
      </div>
    );
  }

  if (message.kind === "error") {
    return <div className="tool-log-line is-error">{message.title}: {message.content}</div>;
  }

  return <div className="tool-log-line">{message.title}: {message.content}</div>;
}
