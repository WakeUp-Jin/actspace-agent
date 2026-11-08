import type { ReactNode } from "react";
import { EmptyState, type DeltaTone } from "../stats/stats-ui";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";

/* Harness 统计页自己用的小件：提示条、一块数据的加载 / 出错外壳、版本对比表、说明条。
   通用骨架（卡片、指标卡、表格…）在 ../stats/stats-ui.tsx。 */

export function Notice({ tone, children, role = "status" }: { tone: "info" | "warn" | "error"; children: ReactNode; role?: "status" | "alert" }) {
  return (
    <div role={role} className={cn("rounded-act-md px-3 py-2 text-act-xs", tone === "error" ? "bg-danger-soft text-on-danger" : tone === "warn" ? "bg-warning-soft text-text-main" : "bg-surface-subtle text-text-muted")}>
      {children}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Notice tone="error" role="alert">
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <Button size="xs" variant="secondary" onClick={onRetry}>重试</Button>
      </span>
    </Notice>
  );
}

/** 卡片还没有数据时的占位：出错显示错误和重试，否则显示「正在读取…」。 */
export function Pending({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return error ? <ErrorNotice message={error} onRetry={onRetry} /> : <EmptyState>正在读取…</EmptyState>;
}

/** 卡片里的一行灰底说明。 */
export function Explainer({ children }: { children: ReactNode }) {
  return <p className="mb-2 rounded-act-sm bg-surface-subtle px-2 py-1 text-act-xxs leading-relaxed text-text-faint">{children}</p>;
}

const TONE_CLASS: Record<DeltaTone, string> = { good: "text-operational", bad: "text-on-danger", flat: "text-text-faint" };

export type CompareRow = { key: string; label: string; from: string; to: string; delta: string; tone: DeltaTone };

/** 版本对比的四列表：指标 / A / B / 变化。 */
export function CompareGrid({ fromLabel, toLabel, rows }: { fromLabel: string; toLabel: string; rows: readonly CompareRow[] }) {
  const cell = "whitespace-nowrap border-b border-line py-1.5 tabular-nums";
  return (
    <div role="table" aria-label="版本对比" className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3.5 text-act-xs">
      <div role="row" className="contents text-act-xxs text-text-faint">
        <span role="columnheader" className={cn(cell, "pt-0")}>指标</span>
        <span role="columnheader" className={cn(cell, "pt-0 text-right")}>{fromLabel}</span>
        <span role="columnheader" className={cn(cell, "pt-0 text-right")}>{toLabel}</span>
        <span role="columnheader" className={cn(cell, "pt-0 text-right")}>变化</span>
      </div>
      {rows.map((row) => (
        <div role="row" key={row.key} className="contents">
          <span role="rowheader" className={cn(cell, "truncate text-text-muted")}>{row.label}</span>
          <span role="cell" className={cn(cell, "text-right text-text-main")}>{row.from}</span>
          <span role="cell" className={cn(cell, "text-right text-text-main")}>{row.to}</span>
          <span role="cell" data-tone={row.tone} className={cn(cell, "text-right font-medium", TONE_CLASS[row.tone])}>{row.delta}</span>
        </div>
      ))}
    </div>
  );
}
