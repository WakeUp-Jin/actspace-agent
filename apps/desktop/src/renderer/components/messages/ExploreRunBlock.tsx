import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageBlock, SessionEvent } from "@actspace/shared";
import {
  buildTranscriptSections,
  loadTranscript,
  mergeEvents,
  renderTranscriptItem,
} from "./SubAgentTranscriptModal";
import { TOOL_LOG_LINE_TEXT_RUNNING_CLASS, getToolLogRunningTextAttrs } from "./toolLogStyles";

type ExploreMessage = Extract<MessageBlock, { kind: "agent" }>;

const BLOCK_CLASS = "explore-run flex flex-col gap-[9px]";
// 折叠头与工具行同源（单层 conversation-text-inset），保证和外部 thinking / 最终回复对齐。
const TOGGLE_CLASS =
  "explore-run-toggle inline-flex w-fit items-center gap-1.5 rounded-act-sm border-0 bg-transparent px-[var(--conversation-text-inset)] py-0.5 text-sm font-normal leading-[1.42] text-text-muted transition-colors duration-[150ms] ease-in-out hover:text-text-main";
// 执行中：有界滚动窗口，新行钉底；与主流程同底色（无盒子、无隔离感）。
const RUNNING_VIEWPORT_CLASS = "explore-run-viewport flex max-h-[168px] flex-col gap-[9px] overflow-y-auto";
const DONE_FLOW_CLASS = "flex flex-col gap-[9px]";
const EMPTY_CLASS = "px-[var(--conversation-text-inset)] text-sm leading-[1.55] text-text-muted";

function exploredLabel(message: ExploreMessage): string {
  const count = message.stats?.exploredFileCount ?? 0;
  if (count <= 0) return "Explored";
  return `Explored ${count} ${count === 1 ? "file" : "files"}`;
}

/**
 * 内置 Explore 聚焦子代理的内联展示（独立组件，内部行复用主 Agent 的 ToolLogLine / ThinkingBlock）。
 *
 * - 执行中：折叠头 `Exploring`（shimmer + chevron，默认展开）+ 有界滚动窗口（无底色盒子，与主流程对齐）。
 * - 完成后：自动收起成 `Explored N files`（chevron，可再点开）；展开是同一批嵌套过程行。
 *
 * 过程行来自 transcript：执行中走流式 transcriptEvents；重载后主 session 只有摘要，
 * 首次展开按需经 subagent:get-transcript 懒加载。usage 行不展示。
 */
export function ExploreRunBlock({
  message,
  className,
}: {
  message: ExploreMessage;
  className?: string;
}) {
  const [events, setEvents] = useState<SessionEvent[]>(message.transcriptEvents ?? []);
  const [lazyLoaded, setLazyLoaded] = useState(false);
  const isRunning = message.status === "running";
  const [expanded, setExpanded] = useState(isRunning);
  const wasRunning = useRef(isRunning);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEvents((current) => mergeEvents(current, message.transcriptEvents));
  }, [message.transcriptEvents]);

  // 执行完成时自动收起（用户仍可手动再点开）。
  useEffect(() => {
    if (wasRunning.current && !isRunning) setExpanded(false);
    wasRunning.current = isRunning;
  }, [isRunning]);

  const rows = useMemo(
    () => buildTranscriptSections(events).processItems.filter((item) => item.kind !== "usage"),
    [events],
  );

  // 执行中新行到达时把滚动窗口钉到底部，始终展示最近活动。
  useEffect(() => {
    if (!isRunning || !expanded) return;
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isRunning, expanded, rows.length]);

  const triggerLazyLoad = () => {
    if (lazyLoaded || events.length > 0 || !message.transcriptRef) return;
    setLazyLoaded(true);
    void loadTranscript(message.transcriptRef)
      .then((loaded) => setEvents((current) => mergeEvents(current, loaded)))
      .catch((error) => console.error("Failed to load Explore transcript", error));
  };

  const toggle = () => {
    setExpanded((value) => {
      const next = !value;
      if (next) triggerLazyLoad();
      return next;
    });
  };

  const body =
    rows.length > 0 ? (
      rows.map((item) => renderTranscriptItem(item))
    ) : (
      <div className={EMPTY_CLASS}>{isRunning ? "Exploring…" : "No process events."}</div>
    );

  return (
    <article className={`${BLOCK_CLASS}${className ? ` ${className}` : ""}`}>
      <button className={TOGGLE_CLASS} type="button" aria-expanded={expanded} onClick={toggle}>
        {isRunning ? (
          <span className={TOOL_LOG_LINE_TEXT_RUNNING_CLASS} {...getToolLogRunningTextAttrs("Exploring")}>
            Exploring
          </span>
        ) : (
          <span>{exploredLabel(message)}</span>
        )}
        {expanded ? (
          <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
      {expanded ? (
        isRunning ? (
          <div ref={viewportRef} className={RUNNING_VIEWPORT_CLASS}>
            {body}
          </div>
        ) : (
          <div className={DONE_FLOW_CLASS}>{body}</div>
        )
      ) : null}
      {message.error ? <div className={EMPTY_CLASS}>{message.error}</div> : null}
    </article>
  );
}
