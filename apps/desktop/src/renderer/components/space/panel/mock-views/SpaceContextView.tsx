import type { ContextUsage } from "../../model/panel-fixtures";

/** 上下文标签：总量、分段条、各部分用量（样式对齐 Context 弹窗的色条，色用语义 token）。 */

const TONE_CLASS: Record<ContextUsage["parts"][number]["tone"], string> = {
  neutral: "bg-line-strong",
  info: "bg-info",
  operational: "bg-operational",
  warning: "bg-warning",
};

export function SpaceContextView({ usage }: { usage: ContextUsage }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 px-1.5 pb-3 pt-1">
        <span className="text-act-xl font-semibold tabular-nums text-text-main">{usage.total.toFixed(1)}k</span>
        <small className="text-act-xs text-text-faint">共 {usage.max}k · 用了 {usage.pct}%</small>
      </div>
      <div className="mx-1.5 mb-3 flex h-2 gap-0.5 overflow-hidden rounded-act-pill bg-surface-subtle" aria-hidden="true">
        {usage.parts.map((p) => (
          <i key={p.name} className={`block h-full ${TONE_CLASS[p.tone]}`} style={{ width: `${((p.value / usage.max) * 100).toFixed(2)}%` }} />
        ))}
      </div>
      {usage.parts.map((p) => (
        <div key={p.name} className="flex items-center gap-2 p-1.5 text-act-sm text-text-main">
          <span className={`size-2 shrink-0 rounded-act-xs ${TONE_CLASS[p.tone]}`} aria-hidden="true" />
          {p.name}
          <span className="ml-auto text-act-xs tabular-nums text-text-faint">{p.value.toFixed(1)}k</span>
        </div>
      ))}
    </div>
  );
}
