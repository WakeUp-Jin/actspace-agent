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
    <div className="context-popover" role="dialog" aria-label="Context usage">
      <header className="context-popover-header">
        <strong>Context</strong>
        <button type="button" onClick={onClose} aria-label="Close context">
          <X size={15} strokeWidth={2.2} />
        </button>
      </header>
      <div className="context-summary">
        <span>{safeSnapshot.percentUsed}% Full</span>
        <span>
          ~{safeSnapshot.totalTokens.toLocaleString()} / {safeSnapshot.maxTokens.toLocaleString()} Tokens
        </span>
      </div>
      <div className="context-meter" aria-hidden="true">
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
      <div className="context-buckets">
        {safeSnapshot.buckets.map((bucket) => {
          const key = bucket.key ?? bucket.name ?? "conversation";
          return (
            <div className="context-bucket" key={key}>
              <span className="bucket-swatch" style={{ background: colorByBucket[key] }} />
              <span>{bucket.label ?? key}</span>
              <strong>{bucket.tokens.toLocaleString()}</strong>
            </div>
          );
        })}
      </div>
      <footer className="context-footer">
        <span>Total used {safeSnapshot.cumulativeTokens?.toLocaleString() ?? "0"}</span>
        <span>Compressed {safeSnapshot.compressionCount ?? 0} times</span>
      </footer>
    </div>
  );
}
