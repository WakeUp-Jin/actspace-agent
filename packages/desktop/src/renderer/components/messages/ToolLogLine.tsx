import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import {
  getToolLogRunningTextAttrs,
  TOOL_LOG_LINE_CLASS,
  TOOL_LOG_LINE_ERROR_CLASS,
  TOOL_LOG_LINE_RUNNING_CLASS,
  TOOL_LOG_LINE_TEXT_CLASS,
  TOOL_LOG_LINE_TEXT_RUNNING_CLASS,
} from "./toolLogStyles";

type ToolLogMessage = Extract<MessageBlock, {
  kind: "read" | "search" | "grep" | "glob" | "web_search" | "media_analysis" | "directory_list" | "delete" | "tool" | "error";
}>;
type ToolLogStatus = "running" | "completed" | "failed" | "denied" | undefined;

const TOOL_LOG_LINE_TOOLTIP_CONTAINER_CLASS = "has-overflow-text max-w-full outline-none";
const TOOL_LOG_LINE_TOOLTIP_OPEN_CLASS = "is-tooltip-open";
const TOOL_LOG_TOOLTIP_CLASS =
  "tool-log-tooltip pointer-events-none absolute left-[var(--conversation-text-inset)] top-[calc(100%_+_6px)] z-40 max-w-[min(720px,calc(100vw_-_96px))] rounded-act-sm border border-[rgba(223,228,234,0.84)] bg-[rgba(32,33,36,0.96)] px-[9px] py-[7px] text-xs font-normal leading-[1.55] text-[#f7f8fa] shadow-act-popover [overflow-wrap:anywhere] whitespace-normal";

function OverflowToolLine({
  className,
  status,
  text,
}: {
  className: string;
  status: ToolLogStatus;
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
      className={`${className} ${TOOL_LOG_LINE_TOOLTIP_CONTAINER_CLASS}${isOverflowing ? " has-tooltip" : ""}${
        isTooltipOpen ? ` ${TOOL_LOG_LINE_TOOLTIP_OPEN_CLASS}` : ""
      }`}
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
      <span ref={textRef} {...getToolLogLineTextProps(status, text)}>{text}</span>
      {isOverflowing ? (
        <span className={`${TOOL_LOG_TOOLTIP_CLASS} ${isTooltipOpen ? "block" : "hidden"}`} role="tooltip">
          {text}
        </span>
      ) : null}
    </div>
  );
}

function getToolLogLineClass(status: ToolLogStatus, className?: string) {
  const stateClass = status === "running"
    ? ` ${TOOL_LOG_LINE_RUNNING_CLASS}`
    : status === "failed" || status === "denied"
      ? ` ${TOOL_LOG_LINE_ERROR_CLASS}`
      : "";
  return `${TOOL_LOG_LINE_CLASS}${stateClass}${
    className ? ` ${className}` : ""
  }`;
}

function getToolLogLineTextClass(status: ToolLogStatus) {
  return `${TOOL_LOG_LINE_TEXT_CLASS}${status === "running" ? ` ${TOOL_LOG_LINE_TEXT_RUNNING_CLASS}` : ""}`;
}

function getToolLogLineTextProps(status: ToolLogStatus, text: string) {
  return status === "running"
    ? { className: getToolLogLineTextClass(status), ...getToolLogRunningTextAttrs(text) }
    : { className: getToolLogLineTextClass(status) };
}

function WebToolBlock({
  displayText,
  status,
  resultUrls,
  contentPreview,
  className,
}: {
  displayText: string;
  status: ToolLogStatus;
  resultUrls?: string[];
  contentPreview?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = (resultUrls && resultUrls.length > 0) || !!contentPreview;

  if (status === "running" || !hasContent) {
    return (
      <div className={getToolLogLineClass(status, className)}>
        <span {...getToolLogLineTextProps(status, displayText)}>{displayText}</span>
      </div>
    );
  }

  return (
    <article className={`web-tool-block${className ? ` ${className}` : ""}`}>
      <button
        className="web-tool-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="web-tool-summary">{displayText}</span>
        {expanded
          ? <ChevronDown size={14} strokeWidth={2.2} />
          : <ChevronRight size={14} strokeWidth={2.2} />}
      </button>
      {expanded ? (
        contentPreview ? (
          <pre className="web-tool-content">{contentPreview}</pre>
        ) : (
          <ul className="web-tool-url-list">
            {resultUrls!.map((url, i) => (
              <li key={`${url}-${i}`} className="web-tool-url-item">
                <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </article>
  );
}

export function ToolLogLine({ message, className }: { message: ToolLogMessage; className?: string }) {
  if (message.kind === "read") {
    const lineClassName = getToolLogLineClass(message.status, className);
    const text = `Read ${message.filePath}${message.range ? ` ${message.range}` : ""}`;
    return (
      <div className={lineClassName}>
        <span {...getToolLogLineTextProps(message.status, text)}>{text}</span>
      </div>
    );
  }

  if (message.kind === "search") {
    const lineClassName = getToolLogLineClass(message.status, className);
    const text = `Searched files ${message.scope ? `${message.scope} ` : ""}for ${message.query}`;
    return (
      <div className={lineClassName}>
        <span {...getToolLogLineTextProps(message.status, text)}>{text}</span>
      </div>
    );
  }

  if (message.kind === "grep") {
    return (
      <OverflowToolLine
        className={getToolLogLineClass(message.status, className)}
        status={message.status}
        text={`Grep ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`}
      />
    );
  }

  if (message.kind === "glob") {
    return (
      <OverflowToolLine
        className={getToolLogLineClass(message.status, className)}
        status={message.status}
        text={`Glob ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`}
      />
    );
  }

  if (message.kind === "web_search") {
    return (
      <WebToolBlock
        displayText={message.displayText}
        status={message.status}
        resultUrls={message.resultUrls}
        contentPreview={message.contentPreview}
        className={className}
      />
    );
  }

  if (message.kind === "media_analysis") {
    const lineClassName = getToolLogLineClass(message.status, className);
    return (
      <div className={lineClassName}>
        <span {...getToolLogLineTextProps(message.status, message.displayText)}>
          {message.displayText}
        </span>
      </div>
    );
  }

  if (message.kind === "directory_list") {
    const text = `Listed ${message.path}${message.entryCount !== undefined ? ` (${message.entryCount} entries)` : ""}`;
    return (
      <div className={getToolLogLineClass(message.status, className)}>
        <span {...getToolLogLineTextProps(message.status, text)}>{text}</span>
      </div>
    );
  }

  if (message.kind === "delete") {
    const status = message.status === "pending" ? "running" : message.status;
    return (
      <OverflowToolLine
        className={getToolLogLineClass(status, className)}
        status={status}
        text={message.displayText}
      />
    );
  }

  if (message.kind === "error") {
    return <div className={`${TOOL_LOG_LINE_CLASS} ${TOOL_LOG_LINE_ERROR_CLASS}${className ? ` ${className}` : ""}`}>{message.title}: {message.content}</div>;
  }

  return <div className={`${TOOL_LOG_LINE_CLASS}${className ? ` ${className}` : ""}`}>{message.title}: {message.content}</div>;
}
