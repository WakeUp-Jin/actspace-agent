import type { ReactNode } from "react";
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
  kind: "read" | "search" | "grep" | "glob" | "web_search" | "media_analysis" | "image_generation" | "directory_list" | "delete" | "tool" | "error";
}>;
type ToolLogStatus = "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown" | undefined;

const TOOL_LOG_LINE_TOOLTIP_CONTAINER_CLASS = "has-overflow-text max-w-full outline-none";
const TOOL_LOG_LINE_TOOLTIP_OPEN_CLASS = "is-tooltip-open";
const TOOL_LOG_TOOLTIP_CLASS =
  "tool-log-tooltip pointer-events-none absolute left-[var(--conversation-text-inset)] top-[calc(100%_+_6px)] z-40 max-w-[min(720px,calc(100vw_-_96px))] rounded-act-sm border border-line bg-action px-[9px] py-[7px] text-xs font-normal leading-[1.55] text-on-action shadow-act-popover [overflow-wrap:anywhere] whitespace-normal";

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
    : status === "failed" || status === "denied" || status === "aborted" || status === "outcome-unknown"
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

function ToolSummary({ action, target, meta }: { action: string; target: string; meta?: string }) {
  return <span className="tool-summary-parts"><span className="tool-summary-action">{action}</span>{" "}<span className="tool-summary-target" title={target}>{target}</span>{meta ? <> <span className="tool-summary-meta">{meta}</span></> : null}</span>;
}

function ResultPreviewBlock({ displayText, status, resultPreview, className, onOpenFile, detail, summaryContent }: {
  displayText: string;
  status: ToolLogStatus;
  resultPreview?: string[];
  className?: string;
  onOpenFile?: () => void;
  detail?: string;
  summaryContent?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const canOpenFile = onOpenFile && (status === "completed" || status === undefined);
  const summary = canOpenFile ? (
    <button className="tool-file-link" type="button" onClick={onOpenFile}>{summaryContent ?? displayText}</button>
  ) : <span {...getToolLogLineTextProps(status, displayText)}>{status === "running" ? displayText : summaryContent ?? displayText}</span>;
  const detailItems = status === "completed"
    ? resultPreview?.length ? resultPreview : detail ? [detail] : []
    : detail ? [detail] : [];
  if (status === "running" || !detailItems.length) {
    return <div className={`${getToolLogLineClass(status, className)} tool-result-line`}>{summary}</div>;
  }
  return <article className={`tool-result-disclosure${className ? ` ${className}` : ""}`}>
    <div className="tool-result-header">
      {canOpenFile ? summary : null}
      <button className="tool-result-toggle" type="button" aria-label={canOpenFile ? `Show result for ${displayText}` : undefined} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {canOpenFile ? null : <span className="tool-result-summary">{summaryContent ?? displayText}</span>}
        {expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
      </button>
    </div>
    {expanded ? <ul className="tool-result-list">{detailItems.map((item, index) => <li key={`${item}-${index}`} className="tool-result-item">{item}</li>)}</ul> : null}
  </article>;
}

export function ToolLogLine({ message, className, onOpenFile }: { message: ToolLogMessage; className?: string; onOpenFile?: (message: Extract<MessageBlock, { kind: "read" }>) => void }) {
  if (message.kind === "read") {
    const text = message.status && message.status !== "running" && message.status !== "completed" ? message.displayText : `Read ${message.filePath}${message.range ? ` ${message.range}` : ""}`;
    return <ResultPreviewBlock displayText={text} summaryContent={(!message.status || message.status === "completed") ? <ToolSummary action="Read" target={message.filePath} meta={message.range} /> : undefined} status={message.status} resultPreview={message.resultPreview} className={className} onOpenFile={onOpenFile ? () => onOpenFile(message) : undefined} />;
  }

  if (message.kind === "search") {
    const text = `Searched files ${message.scope ? `${message.scope} ` : ""}for ${message.query}`;
    return <ResultPreviewBlock displayText={text} summaryContent={<ToolSummary action="Searched files" target={`${message.scope ? `${message.scope} ` : ""}for ${message.query}`} />} status={message.status} resultPreview={message.resultPreview} className={className} />;
  }

  if (message.kind === "grep") {
    if (message.resultPreview?.length) return <ResultPreviewBlock displayText={`Grep ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`} summaryContent={<ToolSummary action="Grep" target={`${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`} />} status={message.status} resultPreview={message.resultPreview} className={className} />;
    return (
      <OverflowToolLine
        className={getToolLogLineClass(message.status, className)}
        status={message.status}
        text={message.status && message.status !== "running" && message.status !== "completed" ? message.displayText : `Grep ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`}
      />
    );
  }

  if (message.kind === "glob") {
    if (message.resultPreview?.length) return <ResultPreviewBlock displayText={`Glob ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`} summaryContent={<ToolSummary action="Glob" target={`${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`} />} status={message.status} resultPreview={message.resultPreview} className={className} />;
    return (
      <OverflowToolLine
        className={getToolLogLineClass(message.status, className)}
        status={message.status}
        text={message.status && message.status !== "running" && message.status !== "completed" ? message.displayText : `Glob ${message.pattern}${message.scope ? ` in ${message.scope}` : ""}`}
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

  if (message.kind === "image_generation") {
    const count = message.status === "running"
      ? message.requestedCount
      : message.generatedCount ?? message.requestedCount;
    const action = message.status === "running"
      ? "Generate image"
      : message.status === "failed"
        ? "Generate image failed"
        : "Generated image";
    const countLabel = message.status === "partial"
      ? `${count}/${message.requestedCount}`
      : String(count);
    const text = [action, message.size, countLabel, message.promptPreview, message.model]
      .filter(Boolean)
      .join(" · ");
    const status: ToolLogStatus = message.status === "running"
      ? "running"
      : message.status === "failed"
        ? "failed"
        : "completed";
    return <ResultPreviewBlock displayText={text} status={status} detail={message.errorMessage ?? message.warning} className={className} />;
  }

  if (message.kind === "directory_list") {
    const text = message.status && message.status !== "running" && message.status !== "completed" ? message.displayText : `Listed ${message.path}${message.entryCount !== undefined ? ` (${message.entryCount} entries)` : ""}`;
    return <ResultPreviewBlock displayText={text} summaryContent={(!message.status || message.status === "completed") ? <ToolSummary action="Listed" target={message.path} meta={message.entryCount !== undefined ? `(${message.entryCount} entries)` : undefined} /> : undefined} status={message.status} resultPreview={message.resultPreview} className={className} />;
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

  const status = message.status === "pending" ? "running" : message.status;
  return (
    <OverflowToolLine
      className={getToolLogLineClass(status, className)}
      status={status}
      text={`${message.title}: ${message.content}`}
    />
  );
}
