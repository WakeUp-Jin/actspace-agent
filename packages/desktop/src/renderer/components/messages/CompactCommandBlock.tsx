import type { MessageBlock } from "@actspace/shared";

type CompactMessage = Extract<MessageBlock, { kind: "context_compaction" }>;

const BLOCK_CLASS =
  "message-row compact-command-block w-full px-[var(--conversation-text-inset)] animate-[rise-in_220ms_ease_both]";
const PENDING_CLASS = "text-sm font-medium text-text-faint";
const RUNNING_CLASS =
  "compact-command-running w-full py-2";
const RUNNING_TEXT_CLASS = "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm";
const TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-text-main";
const META_CLASS = "text-text-muted";
const PROGRESS_TRACK_CLASS = "mt-2 h-[3px] w-full overflow-hidden rounded-act-pill bg-line";
const PROGRESS_BAR_CLASS =
  "h-full rounded-act-pill bg-brand transition-[width] duration-200 ease-out motion-reduce:transition-none";
const INDETERMINATE_BAR_CLASS =
  "h-full w-1/2 rounded-act-pill bg-brand animate-[compact-progress_1.1s_ease-in-out_infinite] motion-reduce:animate-none";
const DIVIDER_CLASS = "compact-command-divider flex w-full items-center gap-3 py-3 text-xs font-medium text-text-faint";
const DIVIDER_FAILED_CLASS = "text-on-danger";
const DIVIDER_LINE_CLASS = "h-px min-w-6 flex-1 bg-line";
const DIVIDER_FAILED_LINE_CLASS = "bg-danger-soft";
const DIVIDER_LABEL_CLASS = "shrink min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

function getResultTitle(message: CompactMessage): string {
  if (message.status === "skipped") return "Nothing to compact";
  if (message.status === "failed") return "Compaction failed";
  if (message.status === "completed") return "Context compacted";
  if (message.status === "pending") return "/compact";
  return "Compacting context";
}

function getStageLabel(stage: string | undefined): string {
  switch (stage) {
    case "preparing":
      return "Preparing context";
    case "summarizing":
      return "Summarizing older messages";
    case "writing":
      return "Writing summary";
    default:
      return "Working";
  }
}

function renderDivider(text: string, tone: "default" | "failed" = "default") {
  const failed = tone === "failed";
  const lineClassName = `${DIVIDER_LINE_CLASS}${failed ? ` ${DIVIDER_FAILED_LINE_CLASS}` : ""}`;

  return (
    <div
      className={`${DIVIDER_CLASS}${failed ? ` ${DIVIDER_FAILED_CLASS}` : ""}`}
      role="separator"
      aria-label={text}
    >
      <span className={lineClassName} aria-hidden="true" />
      <span className={DIVIDER_LABEL_CLASS}>{text}</span>
      <span className={lineClassName} aria-hidden="true" />
    </div>
  );
}

export function CompactCommandBlock({ message, className }: { message: CompactMessage; className?: string }) {
  const blockClassName = `${BLOCK_CLASS}${className ? ` ${className}` : ""}`;

  if (message.status === "pending") {
    return (
      <article className={blockClassName}>
        <div className={PENDING_CLASS}>/compact</div>
      </article>
    );
  }

  if (message.status === "running") {
    const progress = typeof message.progress === "number"
      ? Math.max(0, Math.min(1, message.progress))
      : null;

    return (
      <article className={blockClassName}>
        <div className={RUNNING_CLASS}>
          <div className={RUNNING_TEXT_CLASS} role="status" aria-live="polite">
            <span className={TITLE_CLASS}>{message.summaryText || "Compacting context"}</span>
            <span className={META_CLASS} aria-hidden="true">·</span>
            <span className={META_CLASS}>{getStageLabel(message.stage)}</span>
          </div>
          <div
            className={PROGRESS_TRACK_CLASS}
            role="progressbar"
            aria-label="Context compaction progress"
            {...(progress === null ? {} : { "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(progress * 100) })}
          >
            {progress === null ? (
              <div className={INDETERMINATE_BAR_CLASS} />
            ) : (
              <div className={PROGRESS_BAR_CLASS} style={{ width: `${progress * 100}%` }} />
            )}
          </div>
        </div>
      </article>
    );
  }

  if (message.status === "failed") {
    return (
      <article className={blockClassName}>
        {renderDivider(message.summaryText || getResultTitle(message), "failed")}
      </article>
    );
  }

  return (
    <article className={blockClassName}>
      {renderDivider(message.summaryText || getResultTitle(message))}
    </article>
  );
}
