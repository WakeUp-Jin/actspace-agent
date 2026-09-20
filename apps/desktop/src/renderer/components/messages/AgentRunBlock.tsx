import { useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import "./agent-activity.css";
import { AgentAvatar, AgentStatus } from "./AgentIdentity";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;

const BLOCK_CLASS = "message-row agent-run max-w-[800px] px-[var(--conversation-text-inset)]";
const BUTTON_CLASS =
  "group/agent flex w-full min-w-0 items-center gap-3 rounded-act-md border border-line bg-surface-subtle px-3 py-2 text-left transition-[background-color,border-color,color,transform] duration-[150ms] ease-in-out hover:border-line-strong hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--act-color-focus-ring)] active:translate-y-px";
const HEADER_CLASS = "flex min-w-0 items-center gap-2";
const NAME_CLASS = "min-w-0 truncate text-[14px] leading-[1.4] text-text-muted group-hover/agent:text-text-main group-focus-visible/agent:text-text-main";
const TYPE_CLASS = "shrink-0 text-[12px] leading-[1.4] text-text-faint";
const LATEST_CLASS = "min-w-0 truncate text-[12px] leading-[1.45] text-text-muted";
const ERROR_LATEST_CLASS = "text-on-danger";

function statusLabel(status: AgentMessage["status"]): string {
  return status === "running" ? "运行中" : status === "completed" ? "已完成" : status === "aborted" ? "已停止" : "失败";
}

function kindLabel(message: AgentMessage): string {
  return message.agentKind === "agent" ? "Agent" : "Explore";
}

function compactText(value: string | undefined): string | undefined {
  const compact = value?.replace(/\s+/g, " ").trim();
  return compact || undefined;
}

function latestActivity(message: AgentMessage): string {
  if (message.error) return compactText(message.error) ?? "执行失败";
  if (message.status === "running") {
    // Only event-derived labels may appear here, never streamed model output.
    const live = compactText(message.displayText);
    return live && /^(正在|达到|已停止|执行失败)/.test(live) ? live : "正在思考";
  }
  const summaryLine = message.summary?.split(/\r?\n/).find((line) => line.trim().length > 0);
  return compactText(summaryLine) ?? statusLabel(message.status);
}

function ActivityLine({ text, running }: { text: string; running: boolean }) {
  const [frame, setFrame] = useState({ text, previous: "", revision: 0 });
  // Reflect every semantic update immediately; the activity model retains the
  // last operation even when a tool starts and finishes within one render.
  if (frame.text !== text) {
    setFrame({ text, previous: running ? frame.text : "", revision: frame.revision + 1 });
  }
  if (!running) return <span role="status">{text}</span>;
  return <span className="agent-activity-transition" role="status" aria-label={frame.text}>
    {frame.previous && <span key={`old-${frame.revision}`} className="agent-activity-out" aria-hidden="true">{frame.previous}</span>}
    <span key={frame.revision} className={frame.previous ? "agent-activity-in" : undefined} aria-hidden="true">{frame.text}</span>
  </span>;
}

export function AgentRunBlock({
  message,
  className,
  onOpenTranscript,
}: {
  message: AgentMessage;
  className?: string;
  onOpenTranscript?: (message: AgentMessage) => void;
}) {
  const isRunning = message.status === "running";
  const latest = latestActivity(message);
  const latestClass = message.error ? `${LATEST_CLASS} ${ERROR_LATEST_CLASS}` : LATEST_CLASS;

  return (
    <article className={`${BLOCK_CLASS}${className ? ` ${className}` : ""}`}>
      <button
        className={BUTTON_CLASS}
        type="button"
        aria-label={`Open SubAgent transcript for ${message.description}`}
        onClick={() => onOpenTranscript?.(message)}
      >
        <AgentAvatar message={message} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className={HEADER_CLASS}>
            <span className={`${NAME_CLASS} flex-1`} title={message.description}>{message.description || message.displayText || kindLabel(message)}</span>
            <AgentStatus status={message.status} />
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={TYPE_CLASS}>{kindLabel(message)}</span>
            <span aria-hidden="true" className="text-[12px] text-text-faint">·</span>
            <div className={latestClass}><ActivityLine text={latest} running={isRunning} /></div>
          </div>
        </div>
      </button>
    </article>
  );
}
