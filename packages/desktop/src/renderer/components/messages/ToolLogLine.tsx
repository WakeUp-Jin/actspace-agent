import type { MessageBlock } from "@actspace/shared";

type ToolLogMessage = Extract<MessageBlock, { kind: "read" | "search" | "tool" | "error" }>;

export function ToolLogLine({ message }: { message: ToolLogMessage }) {
  if (message.kind === "read") {
    return <div className="tool-log-line">Read {message.filePath} {message.range ?? ""}</div>;
  }

  if (message.kind === "search") {
    return (
      <div className="tool-log-line">
        Searched files {message.scope ? `${message.scope} ` : ""}for {message.query}
      </div>
    );
  }

  if (message.kind === "error") {
    return <div className="tool-log-line is-error">{message.title}: {message.content}</div>;
  }

  return <div className="tool-log-line">{message.title}: {message.content}</div>;
}
