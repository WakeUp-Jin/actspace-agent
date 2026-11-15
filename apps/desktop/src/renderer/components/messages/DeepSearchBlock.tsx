import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogShimmer } from "./ToolLogShimmer";
import { getToolFailureLabel, getToolLogLineClass, getToolLogLineTextProps, ToolSummary } from "./ToolLogLine";

type DeepSearchMessage = Extract<MessageBlock, { kind: "deep_search" }>;

/**
 * The `Deep Search` row (front-中间消息区规范.md「工具行」). Running: one shimmering line. Finished: action, question and
 * stats, expanding to queries and numbered sources. Failed or denied: the reason. A deferred history row has no lists
 * yet; its first expansion calls `onExpand` and `DeferredToolMessage` shows the loading state.
 */
export function DeepSearchBlock({ message, className, onExpand }: { message: DeepSearchMessage; className?: string; onExpand?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { status } = message;
  if (status === "running") {
    return (
      <div className={getToolLogLineClass("running", className)}>
        <span {...getToolLogLineTextProps("running", message.displayText)}>{message.displayText}<ToolLogShimmer text={message.displayText} /></span>
      </div>
    );
  }
  const failure = getToolFailureLabel(status);
  const summary = <ToolSummary action="Deep Search" target={message.question} meta={failure ?? message.stats} />;
  const hasLists = Boolean(message.queries?.length || message.sources?.length || message.failedPages?.length);
  const canExpand = status !== "aborted" && (failure ? Boolean(message.errorText) : hasLists || Boolean(onExpand));
  if (!canExpand) return <div className={`${getToolLogLineClass(status, className)} tool-result-line`}>{summary}</div>;
  return (
    <article className={`tool-result-disclosure deep-search-block${failure ? " is-error" : ""}${className ? ` ${className}` : ""}`}>
      <div className="tool-result-header">
        <button className="tool-result-toggle" type="button" aria-expanded={expanded} onClick={() => { if (!expanded) onExpand?.(); setExpanded(value => !value); }}>
          <span className="tool-result-summary">{summary}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      {expanded ? failure ? <div className="deep-search-detail is-error">{message.errorText}</div> : hasLists ? <DeepSearchDetail message={message} /> : null : null}
    </article>
  );
}

function DeepSearchDetail({ message }: { message: DeepSearchMessage }) {
  return (
    <div className="deep-search-detail">
      {message.queries?.length ? <>
        <div className="deep-search-group">搜索词</div>
        <ul>{message.queries.map((query, index) => <li key={`${query}-${index}`} className="deep-search-item"><span className="deep-search-text">{query}</span></li>)}</ul>
      </> : null}
      {message.sources?.length ? <>
        <div className="deep-search-group">引用来源</div>
        <ol>{message.sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="deep-search-item">
            <span className="deep-search-number">{index + 1}</span>
            <a className="deep-search-text" href={source.url} target="_blank" rel="noopener noreferrer" title={source.url}>{source.title}</a>
            {source.site ? <span className="deep-search-site">{source.site}</span> : null}
          </li>
        ))}</ol>
      </> : null}
      {message.failedPages?.length ? <>
        <div className="deep-search-group">未能打开</div>
        <ul>{message.failedPages.map((page, index) => (
          <li key={`${page.url}-${index}`} className="deep-search-item is-error">
            <span className="deep-search-text">{page.url}</span>
            <span className="deep-search-site">{page.code}</span>
          </li>
        ))}</ul>
      </> : null}
    </div>
  );
}
