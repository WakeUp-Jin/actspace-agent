import type { TurnUsageView } from "../../sessions/usage-format";
import { Sheet } from "../../ui/Sheet";

/** 本轮用量：模型、缓存、输入输出 token 与花费（来自 Host 投影的 assistant.usage）。 */
export function UsageSheet({ open, onOpenChange, view }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly view: TurnUsageView }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="本轮用量">
      <div className="pb-1">
        {view.rows.map(row => (
          <div key={row.label} className="kv-row">
            <span className="text-text-muted">{row.label}</span>
            <span className="min-w-0 text-right tabular-nums">
              <span className="break-words">{row.value}</span>
              {row.note ? <span className="block text-act-xs text-text-faint">{row.note}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
