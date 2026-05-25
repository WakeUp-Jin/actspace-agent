import type { MessageBlock } from "@actspace/shared";

type ToolLogMessage = Extract<MessageBlock, { kind: "read" | "search" | "directory_list" | "tool" | "error" }>;

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
