import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

type CompactMessage = Extract<MessageBlock, { kind: "context_compaction" }>;

const BLOCK_CLASS =
  "message-row compact-command-block max-w-[720px] px-[var(--conversation-text-inset)] animate-[rise-in_220ms_ease_both]";
const PENDING_CLASS = "inline-flex min-w-0 items-center gap-2 text-sm text-text-faint";
const RUNNING_CLASS =
  "rounded-act-md border border-line bg-surface-subtle px-3.5 py-3 shadow-act-soft";
const RESULT_CLASS =
  "inline-flex min-w-0 items-center gap-2 rounded-act-sm border border-line bg-surface-subtle px-2.5 py-1.5 text-sm text-text-muted";
const FAILED_CLASS =
  "inline-flex min-w-0 items-center gap-2 rounded-act-sm border border-danger-soft bg-danger-soft px-2.5 py-1.5 text-sm text-on-danger";
const TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold";
const META_CLASS = "shrink-0 text-xs text-text-faint";
const PROGRESS_TRACK_CLASS = "mt-2 h-1 overflow-hidden rounded-act-pill bg-line";
const PROGRESS_BAR_CLASS =
  "h-full rounded-act-pill bg-brand transition-[width] duration-200 ease-out motion-reduce:transition-none";
const INDETERMINATE_BAR_CLASS =
  "h-full w-1/2 rounded-act-pill bg-brand animate-[compact-progress_1.1s_ease-in-out_infinite] motion-reduce:animate-none";

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
      return "Preparing";
    case "summarizing":
      return "Summarizing";
    case "writing":
      return "Writing";
    default:
      return "Running";
  }
}

export function CompactCommandBlock({ message, className }: { message: CompactMessage; className?: string }) {
  const blockClassName = `${BLOCK_CLASS}${className ? ` ${className}` : ""}`;

  if (message.status === "pending") {
    return (
      <article className={blockClassName}>
        <div className={PENDING_CLASS}>
          <CircleDashed size={15} strokeWidth={2.1} aria-hidden="true" />
          <span className={TITLE_CLASS}>/compact</span>
        </div>
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
          <div className="flex min-w-0 items-center gap-2 text-text-main">
            <Loader2 size={16} strokeWidth={2.2} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className={TITLE_CLASS}>{message.summaryText || "Compacting context"}</span>
            <span className={META_CLASS}>{getStageLabel(message.stage)}</span>
          </div>
          <div className={PROGRESS_TRACK_CLASS} aria-hidden="true">
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
        <div className={FAILED_CLASS}>
          <XCircle size={15} strokeWidth={2.1} aria-hidden="true" />
          <span className={TITLE_CLASS}>{message.summaryText || getResultTitle(message)}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={blockClassName}>
      <div className={RESULT_CLASS}>
        <CheckCircle2 size={15} strokeWidth={2.1} className="shrink-0 text-success" aria-hidden="true" />
        <span className={TITLE_CLASS}>{message.summaryText || getResultTitle(message)}</span>
        {message.reductionLabel ? <span className={META_CLASS}>{message.reductionLabel}</span> : null}
      </div>
    </article>
  );
}
