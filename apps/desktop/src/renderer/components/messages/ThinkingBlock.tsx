import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { hasVisibleText, type MessageBlock } from "@actspace/shared";
import { useSimplifyThinking } from "../conversation/display-settings";
import { formatThinkingElapsed, thinkingOpeningClause } from "./thinking-title";
import { ToolLogShimmer } from "./ToolLogShimmer";
import {
  getToolLogRunningTextAttrs,
  TOOL_LOG_LINE_TEXT_RUNNING_CLASS,
} from "./toolLogStyles";

type ThinkingMessage = Extract<MessageBlock, { kind: "thinking" }>;

const THINKING_BLOCK_CLASS =
  "message-row thinking-block max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] animate-[fade-in_260ms_ease_both]";
const THINKING_TOGGLE_CLASS =
  "thinking-toggle group flex max-w-full items-center gap-2 border-0 bg-transparent p-0 text-act-sm font-normal leading-5 text-text-faint";
const THINKING_CONTENT_CLASS =
  "thinking-content mt-[7px] mb-0 whitespace-pre-wrap font-[inherit] text-act-sm leading-relaxed text-text-muted";
/** 简化样式收起时箭头占位但隐藏，标题每秒变化时箭头不跳；hover / 聚焦 / 展开时可见。 */
const QUIET_CHEVRON_CLASS = "shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100";

export function ThinkingBlock({ message, className, replyCompleted = false }: {
  message: ThinkingMessage;
  className?: string;
  replyCompleted?: boolean;
}) {
  const simplify = useSimplifyThinking();
  const [expanded, setExpanded] = useState(() => !simplify && !replyCompleted && !message.collapsedByDefault);
  // 用户点过标题之后，开关切换和重渲染都不再改它的展开状态。
  const manual = useRef(false);
  // A thinking segment can finish before the final answer. Collapse once the
  // whole reply finishes; later rerenders must preserve manual reopening.
  useEffect(() => {
    if (replyCompleted) setExpanded(false);
  }, [replyCompleted]);
  // 设置读到之前按缺省（开启）渲染；开关真的变了时，没被点过、回复也没结束的思考跟着切到对应的默认展开状态。
  const lastSimplify = useRef(simplify);
  useEffect(() => {
    if (lastSimplify.current === simplify) return;
    lastSimplify.current = simplify;
    if (!manual.current && !replyCompleted) setExpanded(!simplify && !message.collapsedByDefault);
  }, [simplify, replyCompleted, message.collapsedByDefault]);
  const blockClassName = `${THINKING_BLOCK_CLASS} ${className ?? ""}`;
  const running = message.status === "running";
  // Projections already drop invisible thinking; this guards any other source from rendering an empty body.
  if (!hasVisibleText(message.content)) return null;

  const toggle = () => {
    manual.current = true;
    setExpanded((value) => !value);
  };
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <article className={blockClassName}>
      <button className={THINKING_TOGGLE_CLASS} type="button" aria-expanded={expanded} onClick={toggle}>
        {simplify
          ? <SimplifiedThinkingTitle message={message} running={running} />
          : <ThinkingTitleText text={message.title} running={running} />}
        <Chevron size={14} className={simplify && !expanded ? QUIET_CHEVRON_CLASS : undefined} />
      </button>
      {expanded ? <pre className={THINKING_CONTENT_CLASS}>{message.content}</pre> : null}
    </article>
  );
}

function ThinkingTitleText({ text, running, className }: { text: string; running: boolean; className?: string }) {
  return (
    <span
      className={[running ? TOOL_LOG_LINE_TEXT_RUNNING_CLASS : "", className ?? ""].filter(Boolean).join(" ") || undefined}
      {...(running ? getToolLogRunningTextAttrs(text) : {})}
    >
      {text}
      {running ? <ToolLogShimmer text={text} /> : null}
    </span>
  );
}

/**
 * 简化样式的标题：`Thinking 6s · 开头一句`（运行中）、`Thought for 9s`（本轮内已结束）、`Thinking`（不知道用时）。
 * 单独成组件，每秒的计时只让这一行重渲染。
 */
function SimplifiedThinkingTitle({ message, running }: { message: ThinkingMessage; running: boolean }) {
  const mountedAt = useRef(Date.now());
  const clause = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { window.clearInterval(timer); };
  }, [running]);

  let text: string;
  if (running) {
    // 开头一句取到后固定，不再随正文变化。
    clause.current ??= thinkingOpeningClause(message.content);
    const elapsed = formatThinkingElapsed(now - (message.startedAtMs ?? mountedAt.current));
    text = clause.current ? `Thinking ${elapsed} · ${clause.current}` : `Thinking ${elapsed}`;
  } else {
    text = message.durationMs === undefined ? "Thinking" : `Thought for ${formatThinkingElapsed(message.durationMs)}`;
  }
  return <ThinkingTitleText text={text} running={running} className="min-w-0 truncate tabular-nums" />;
}
