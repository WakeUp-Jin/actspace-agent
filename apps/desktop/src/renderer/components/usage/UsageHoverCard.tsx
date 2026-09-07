import { useId, useState, type ReactNode } from "react";
import type { UsageActivityRow } from "@actspace/shared";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/HoverCard";
import { formatUsageAmount } from "../../usage-format";

type View = "model" | "tokens";
const titles: Record<View, string> = { model: "模型定价", tokens: "Token 明细" };
const buckets = [
  { label: "缓存读取", token: "cacheReadTokens", rate: "cacheRead" },
  { label: "缓存写入", token: "cacheWriteTokens", rate: "cacheWrite" },
  { label: "输入", token: "inputTokens", rate: "input" },
  { label: "输出", token: "outputTokens", rate: "output" },
] as const;
const count = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("zh-CN");

export function UsageHoverCard({ row, view, children }: { row: UsageActivityRow; view: View; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pricing = row.costProvenance?.pricingSnapshot;
  const visibleBuckets = buckets.filter(({ token, rate }) => rate !== "cacheWrite" || (view === "model" ? pricing?.rates.cacheWrite != null : row.tokens[token] !== 0));
  return <HoverCard open={open} onOpenChange={setOpen} openDelay={250} closeDelay={150}>
    <HoverCardTrigger asChild>
      <button type="button" aria-label={`${titles[view]}：${view === "model" ? row.model ?? "未知模型" : count(row.tokens.totalTokens)}`}
        aria-describedby={open ? id : undefined} onClick={() => setOpen(true)}
        className="block w-full min-w-0 cursor-help rounded-sm text-inherit [text-align:inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{children}</button>
    </HoverCardTrigger>
    <HoverCardContent id={id} role="region" aria-label={titles[view]} align="end" className="w-[208px]">
      {view === "model" && !pricing ? <p className="text-text-muted">暂无单价</p> : <dl className="space-y-1">
        {visibleBuckets.map(({ label, token, rate }) => <Line key={rate} label={label} value={view === "model" ? formatUsageAmount(pricing!.rates[rate], pricing!.currency) : count(row.tokens[token])} />)}
      </dl>}
      {view === "tokens" ? <dl className="mt-2 border-t border-line pt-2 font-medium"><Line label="合计" value={count(row.tokens.totalTokens)} /></dl> : null}
    </HoverCardContent>
  </HoverCard>;
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4"><dt className="text-text-muted">{label}</dt><dd className="text-right tabular-nums">{value}</dd></div>;
}
