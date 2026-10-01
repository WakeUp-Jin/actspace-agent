import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { MarkdownProse } from "./MarkdownProse";

type CompactMessage = Extract<MessageBlock, { kind: "context_compaction" }>;

/** 对话视图提供的「重新压缩」入口；失败分隔线上的「重试」走它，避免把回调穿过 renderMessage 的位置参数。 */
export const CompactionRetryContext = createContext<(() => void) | undefined>(undefined);

// 手动 /compact 与自动压缩共用这一套：进行中计时 + 不确定进度条；完成是一条可展开摘要的分隔线；失败是红色分隔线 + 重试。
const BLOCK_CLASS =
  "message-row compact-command-block w-full px-[var(--conversation-text-inset)] animate-[rise-in_220ms_ease_both]";
const RUNNING_CLASS = "compact-command-running w-full py-2";
const RUNNING_TEXT_CLASS = "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-act-md leading-5";
const TITLE_CLASS = "min-w-0 font-semibold text-text-main";
const META_CLASS = "text-text-faint tabular-nums";
const PROGRESS_TRACK_CLASS = "mt-2 h-[3px] w-full overflow-hidden rounded-act-pill bg-line";
const INDETERMINATE_BAR_CLASS =
  "h-full w-1/2 rounded-act-pill bg-operational animate-[compact-progress_1.1s_ease-in-out_infinite] motion-reduce:animate-none";
const CAPTION_CLASS = "mt-1.5 text-act-xs leading-4 text-text-faint";
// 颜色按状态二选一，不叠加：同一属性出现两个 utility 时生效的是 Tailwind 生成顺序。
const DIVIDER_CLASS = "compact-command-divider flex w-full items-center gap-3 py-2.5 text-act-xs leading-4 font-medium";
const DIVIDER_LINE_CLASS = "h-px min-w-6 flex-1";
const DIVIDER_LABEL_CLASS = "inline-flex min-w-0 items-center gap-1 px-1 py-0.5 tabular-nums";
const DIVIDER_TOGGLE_CLASS =
  "rounded-act-xs transition-colors duration-(--motion-fast) hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const DIVIDER_TEXT_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const CHEVRON_CLASS = "shrink-0 transition-transform duration-(--motion-fast) motion-reduce:transition-none";
const RETRY_CLASS =
  "shrink-0 rounded-act-xs font-semibold text-text-main underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const SUMMARY_CLASS = "compact-command-summary mb-2 rounded-act-md bg-surface-subtle px-3.5 py-3 text-act-sm text-text-muted animate-[rise-in_180ms_ease_both]";
const SUMMARY_HEAD_CLASS = "mb-1.5 flex items-center justify-between gap-3 text-act-xs leading-4 text-text-faint";
const SUMMARY_COPY_CLASS =
  "rounded-act-xs text-text-muted hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const SUMMARY_BODY_CLASS = "max-h-60 overflow-y-auto";
const SUMMARY_FOOT_CLASS = "mt-2 border-t border-line pt-2 text-act-xs leading-4 text-text-faint";

export function formatCompactionDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function useElapsedMs(startedAt: string | undefined, active: boolean): number | null {
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || Number.isNaN(startMs)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, startMs]);
  return Number.isNaN(startMs) ? null : Math.max(0, now - startMs);
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function DividerLines({ failed, children }: { failed?: boolean; children: ReactNode }) {
  const lineClassName = `${DIVIDER_LINE_CLASS} ${failed ? "bg-danger-soft" : "bg-line"}`;
  return (
    <div className={`${DIVIDER_CLASS} ${failed ? "text-on-danger" : "text-text-faint"}`}>
      <span className={lineClassName} aria-hidden="true" />
      {children}
      <span className={lineClassName} aria-hidden="true" />
    </div>
  );
}

function CompactionSummary({ summary }: { summary: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className={SUMMARY_CLASS}>
      <div className={SUMMARY_HEAD_CLASS}>
        <span>压缩摘要 · {summary.length} 字</span>
        <button type="button" className={SUMMARY_COPY_CLASS} onClick={() => void copyText(summary).then(setCopied)}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className={SUMMARY_BODY_CLASS}>
        <MarkdownProse content={summary} />
      </div>
      <div className={SUMMARY_FOOT_CLASS}>分隔线以上的消息仍然显示，但模型之后只通过这段摘要了解它们。</div>
    </div>
  );
}

function completedLabel(message: CompactMessage): string {
  const parts = ["上下文已压缩"];
  if (typeof message.removedCount === "number" && message.removedCount > 0) parts.push(`${message.removedCount} 条消息`);
  if (typeof message.durationMs === "number") parts.push(formatCompactionDuration(message.durationMs));
  return parts.join(" · ");
}

export function CompactCommandBlock({
  message,
  className,
  onRetry,
}: {
  message: CompactMessage;
  className?: string;
  onRetry?: () => void;
}) {
  const blockClassName = `${BLOCK_CLASS}${className ? ` ${className}` : ""}`;
  const contextRetry = useContext(CompactionRetryContext);
  const retry = onRetry ?? contextRetry;
  const [expanded, setExpanded] = useState(false);
  const elapsedMs = useElapsedMs(message.startedAt, message.status === "running");

  if (message.status === "running") {
    return (
      <article className={blockClassName}>
        <div className={RUNNING_CLASS}>
          <div className={RUNNING_TEXT_CLASS} role="status" aria-live="polite">
            <span className={TITLE_CLASS}>正在压缩上下文</span>
            {elapsedMs === null ? null : (
              <>
                <span className={META_CLASS} aria-hidden="true">·</span>
                <span className={META_CLASS}>{formatCompactionDuration(elapsedMs)}</span>
              </>
            )}
          </div>
          <div className={PROGRESS_TRACK_CLASS} role="progressbar" aria-label="上下文压缩进度">
            <div className={INDETERMINATE_BAR_CLASS} />
          </div>
          <div className={CAPTION_CLASS}>正在总结较早的消息。</div>
        </div>
      </article>
    );
  }

  if (message.status === "failed") {
    const label = message.errorMessage ? `上下文压缩失败 · ${message.errorMessage}` : "上下文压缩失败";
    return (
      <article className={blockClassName}>
        <DividerLines failed>
          <span className={DIVIDER_LABEL_CLASS} role="alert">
            <span className={DIVIDER_TEXT_CLASS} title={label}>{label}</span>
            {retry ? (
              <button type="button" className={`${RETRY_CLASS} ml-1`} onClick={retry}>重试</button>
            ) : null}
          </span>
        </DividerLines>
      </article>
    );
  }

  const label = completedLabel(message);
  const summary = message.summary?.trim();
  return (
    <article className={blockClassName}>
      <DividerLines>
        {summary ? (
          <button
            type="button"
            className={`${DIVIDER_LABEL_CLASS} ${DIVIDER_TOGGLE_CLASS}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className={DIVIDER_TEXT_CLASS}>{label}</span>
            <ChevronRight size={12} strokeWidth={2.2} className={`${CHEVRON_CLASS}${expanded ? " rotate-90" : ""}`} aria-hidden="true" />
          </button>
        ) : (
          <span className={DIVIDER_LABEL_CLASS} role="separator" aria-label={label}>
            <span className={DIVIDER_TEXT_CLASS}>{label}</span>
          </span>
        )}
      </DividerLines>
      {summary && expanded ? <CompactionSummary summary={summary} /> : null}
    </article>
  );
}
