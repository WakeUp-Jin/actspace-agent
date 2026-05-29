import { X } from "lucide-react";
import type { ContextUsageSnapshot } from "@actspace/shared";

const colorByBucket: Record<string, string> = {
  systemPrompt: "#aeb8c6",
  tools: "#b68cff",
  rules: "#87d58a",
  skills: "#ffe978",
  mcp: "#b991ff",
  subagents: "#2f86ff",
  conversation: "#f5a313"
};

const CONTEXT_POPOVER_CLASS =
  "context-popover absolute bottom-[calc(100%_+_10px)] right-0 z-20 w-[min(820px,100%)] rounded-2xl border border-[#b8c6dd] bg-[#20262d] px-3.5 pb-3.5 pt-[13px] text-[#dce3ec] shadow-act-popover";
const CONTEXT_ROW_CLASS = "flex items-center justify-between gap-3.5";
const CONTEXT_CLOSE_CLASS =
  "grid h-6 w-6 place-items-center rounded-full border-0 bg-[#3b424b] text-[#bfc8d4]";
const CONTEXT_SUMMARY_CLASS = `${CONTEXT_ROW_CLASS} py-3 pb-2 text-sm text-[#c6ced8]`;
const CONTEXT_METER_CLASS = "context-meter flex h-[5px] overflow-hidden rounded-full bg-[#555e68]";
const CONTEXT_BUCKETS_CLASS = "context-buckets grid gap-[9px] py-4 pb-3";
const CONTEXT_BUCKET_CLASS = "context-bucket grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 text-sm text-[#d4dbe4]";
const BUCKET_SWATCH_CLASS = "bucket-swatch h-[13px] w-[13px] rounded-[3px]";
const CONTEXT_BUCKET_VALUE_CLASS = "font-semibold text-[#c8d0da]";
const CONTEXT_FOOTER_CLASS = `${CONTEXT_ROW_CLASS} border-t border-[#3b424b] pt-2.5 text-xs text-[#9ea9b8]`;

export function ContextPopup({
  snapshot,
  onClose
}: {
  snapshot: ContextUsageSnapshot | null;
  onClose: () => void;
}) {
  const safeSnapshot =
    snapshot ?? {
      totalTokens: 0,
      maxTokens: 200_000,
      percentUsed: 0,
      compressionCount: 0,
      cumulativeTokens: 0,
      buckets: []
    };

  return (
    <div className={CONTEXT_POPOVER_CLASS} role="dialog" aria-label="Context usage">
      <header className={`context-popover-header ${CONTEXT_ROW_CLASS}`}>
        <strong>Context</strong>
        <button className={CONTEXT_CLOSE_CLASS} type="button" onClick={onClose} aria-label="Close context">
          <X size={15} strokeWidth={2.2} />
        </button>
      </header>
      <div className={CONTEXT_SUMMARY_CLASS}>
        <span>{safeSnapshot.percentUsed}% Full</span>
        <span>
          ~{safeSnapshot.totalTokens.toLocaleString()} / {safeSnapshot.maxTokens.toLocaleString()} Tokens
        </span>
      </div>
      <div className={CONTEXT_METER_CLASS} aria-hidden="true">
        {safeSnapshot.buckets.map((bucket) => {
          const key = bucket.key ?? bucket.name ?? "conversation";
          const width = safeSnapshot.totalTokens > 0 ? `${(bucket.tokens / safeSnapshot.totalTokens) * 100}%` : "0%";
          return (
            <span
              key={key}
              style={{
                width,
                background: colorByBucket[key]
              }}
            />
          );
        })}
      </div>
      <div className={CONTEXT_BUCKETS_CLASS}>
        {safeSnapshot.buckets.map((bucket) => {
          const key = bucket.key ?? bucket.name ?? "conversation";
          return (
            <div className={CONTEXT_BUCKET_CLASS} key={key}>
              <span className={BUCKET_SWATCH_CLASS} style={{ background: colorByBucket[key] }} />
              <span>{bucket.label ?? key}</span>
              <strong className={CONTEXT_BUCKET_VALUE_CLASS}>{bucket.tokens.toLocaleString()}</strong>
            </div>
          );
        })}
      </div>
      <footer className={`context-footer ${CONTEXT_FOOTER_CLASS}`}>
        <span>Total used {safeSnapshot.cumulativeTokens?.toLocaleString() ?? "0"}</span>
        <span>Compressed {safeSnapshot.compressionCount ?? 0} times</span>
      </footer>
    </div>
  );
}
