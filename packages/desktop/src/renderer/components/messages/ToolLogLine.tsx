import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MessageBlock } from "@actspace/shared";

type ToolLogMessage = Extract<MessageBlock, {
  kind: "read" | "search" | "grep" | "glob" | "web_search" | "directory_list" | "tool" | "error";
}>;

function OverflowToolLine({
  className,
  text,
}: {
  className: string;
  text: string;
}) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  const updateOverflow = useCallback(() => {
    const element = textRef.current;

    if (!element) {
      setIsOverflowing(false);
      return;
    }

    setIsOverflowing(element.scrollWidth > element.clientWidth);
  }, []);

  useLayoutEffect(() => {
    updateOverflow();

    const element = textRef.current;
    if (!element) {
      return undefined;
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateOverflow)
        : null;

    resizeObserver?.observe(element);
    window.addEventListener("resize", updateOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [text, updateOverflow]);

  useLayoutEffect(() => {
    if (!isOverflowing) {
      setIsTooltipOpen(false);
    }
  }, [isOverflowing]);

  return (
    <div
      className={`${className} has-overflow-text${isOverflowing ? " has-tooltip" : ""}${isTooltipOpen ? " is-tooltip-open" : ""}`}
      tabIndex={isOverflowing ? 0 : undefined}
      aria-label={isOverflowing ? text : undefined}
      onBlur={() => setIsTooltipOpen(false)}
      onFocus={() => {
        if (isOverflowing) {
          setIsTooltipOpen(true);
        }
      }}
      onMouseEnter={() => {
        if (isOverflowing) {
          setIsTooltipOpen(true);
        }
      }}
      onMouseLeave={() => setIsTooltipOpen(false)}
    >
      <span ref={textRef} className="tool-log-line-text">{text}</span>
      {isOverflowing ? (
        <span className="tool-log-tooltip" role="tooltip">
          {text}
        </span>
      ) : null}
    </div>
  );
}

export function ToolLogLine({ message }: { message: ToolLogMessage }) {
  if (message.kind === "read") {
    const className = `tool-log-line${message.status === "running" ? " is-running" : ""}`;
    return (
      <div className={className}>
        <span className="tool-log-line-text">Read {message.filePath} {message.range ?? ""}</span>
      </div>
    );
  }

  if (message.kind === "search") {
    const className = `tool-log-line${message.status === "running" ? " is-running" : ""}`;
    return (
      <div className={className}>
        <span className="tool-log-line-text">
          Searched files {message.scope ? `${message.scope} ` : ""}for {message.query}
        </span>
      </div>
    );
  }

  if (message.kind === "grep") {
    const className = `tool-log-line${message.status === "running" ? " is-running" : ""}`;
    return <OverflowToolLine className={className} text={`Grep ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`} />;
  }

  if (message.kind === "glob") {
    const className = `tool-log-line${message.status === "running" ? " is-running" : ""}`;
    return <OverflowToolLine className={className} text={`Glob ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`} />;
  }

  if (message.kind === "web_search") {
    const className = `tool-log-line${message.status === "running" ? " is-running" : ""}`;
    return (
      <div className={className}>
        <span className="tool-log-line-text">{message.displayText}</span>
      </div>
    );
  }

  if (message.kind === "directory_list") {
    return (
      <div className={`tool-log-line${message.status === "running" ? " is-running" : ""}`}>
        <span className="tool-log-line-text">
          Listed {message.path}{message.entryCount !== undefined ? ` (${message.entryCount} entries)` : ""}
        </span>
      </div>
    );
  }

  if (message.kind === "error") {
    return <div className="tool-log-line is-error">{message.title}: {message.content}</div>;
  }

  return <div className="tool-log-line">{message.title}: {message.content}</div>;
}
