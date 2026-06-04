import { ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { getToolLogRunningTextAttrs, TOOL_LOG_LINE_TEXT_RUNNING_CLASS } from "./toolLogStyles";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;

const BLOCK_CLASS =
  "message-row agent-run max-w-[800px] px-[var(--conversation-text-inset)]";
const BUTTON_CLASS =
  "w-full rounded-act-md border border-line bg-surface px-3.5 py-3 text-left transition hover:border-line-strong hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--act-color-focus-ring)]";
const HEADER_CLASS = "flex items-start justify-between gap-3";
const TITLE_WRAP_CLASS = "min-w-0";
const TITLE_CLASS = "min-w-0 text-[14px] font-semibold leading-[1.4] text-text-main";
const CHEVRON_CLASS = "mt-1 flex-none text-text-faint";
const SUMMARY_CLASS = "mt-2 line-clamp-4 text-[13px] leading-[1.55] text-text-muted";
const RECENT_CLASS = "mt-2 flex flex-col gap-1.5";
const RECENT_LINE_CLASS = "text-[13px] leading-[1.45] text-text-muted";
const STATS_CLASS = "mt-2 text-[12px] leading-[1.45] text-text-faint";
const ERROR_CLASS = "mt-2 rounded-act-sm bg-danger-soft px-2.5 py-2 text-[13px] leading-[1.45] text-on-danger";

function formatStats(message: AgentMessage): string | null {
  const stats = message.stats;
  if (!stats) return null;
  const parts = [];
  if (stats.exploredFileCount !== undefined) {
    parts.push(`Explored ${stats.exploredFileCount} files`);
  }
  parts.push(`${stats.toolCallCount} tools`);
  parts.push(`${Math.max(1, Math.round(stats.durationMs / 1000))}s`);
  if (stats.totalTokens !== undefined && stats.totalTokens > 0) {
    parts.push(`${stats.totalTokens} tokens`);
  }
  return parts.join(" · ");
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
  const stats = formatStats(message);
  const recentEvents = message.recentEvents?.slice(-5) ?? [];

  return (
    <article className={`${BLOCK_CLASS}${className ? ` ${className}` : ""}`}>
      <button
        className={BUTTON_CLASS}
        type="button"
        aria-label={`Open SubAgent transcript for ${message.description}`}
        onClick={() => onOpenTranscript?.(message)}
      >
        <div className={HEADER_CLASS}>
          <div className={TITLE_WRAP_CLASS}>
            <div className={TITLE_CLASS}>{message.description || message.displayText || "Agent"}</div>
          </div>
          <ChevronRight className={CHEVRON_CLASS} size={16} aria-hidden="true" />
        </div>

        {isRunning ? (
          <div className={RECENT_CLASS}>
            {(recentEvents.length > 0 ? recentEvents : [{ id: "pending", summary: "Starting SubAgent run..." }]).map((event) => (
              <div key={event.id} className={RECENT_LINE_CLASS}>
                <span className={TOOL_LOG_LINE_TEXT_RUNNING_CLASS} {...getToolLogRunningTextAttrs(event.summary)}>
                  {event.summary}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {!isRunning && message.summary ? (
          <div className={SUMMARY_CLASS}>{message.summary}</div>
        ) : null}

        {message.error ? <div className={ERROR_CLASS}>{message.error}</div> : null}
        {stats ? <div className={STATS_CLASS}>{stats}</div> : null}
      </button>
    </article>
  );
}
