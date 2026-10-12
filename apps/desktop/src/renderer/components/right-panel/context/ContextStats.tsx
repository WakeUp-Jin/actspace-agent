import type { ContextPanelStats } from "@actspace/shared";
import { formatTokenCount } from "../../../context-format";
import { cn } from "../../ui/cn";
import { cacheHitRate, cumulativeTokens } from "./context-panel-model";
import { HelpHint } from "./ContextPanelParts";

const CACHE_HINT = "缓存读 ÷（缓存读 + 未命中输入），来自服务商返回的真实用量";
const CUMULATIVE_HINT = "整个会话所有请求的输入 + 输出 + 缓存读写";

type StatCell = { key: string; label: string; value: string; unit?: string; hint?: string };

/** ② 会话统计：2×3 格。`costUsd` 为 null 时隐藏费用格，没有用量数据时缓存和累计两格显示「—」。 */
export function ContextStats({ stats }: { stats: ContextPanelStats | null }) {
  const hitRate = cacheHitRate(stats?.cumulativeUsage ?? null);
  const cumulative = cumulativeTokens(stats?.cumulativeUsage ?? null);
  const cells: StatCell[] = [
    { key: "turns", label: "轮次", value: stats ? String(stats.turnCount) : "—" },
    { key: "steps", label: "步数", value: stats ? String(stats.stepCount) : "—" },
    { key: "compactions", label: "压缩", value: stats ? String(stats.compactionCount) : "—", unit: "次" },
    { key: "cache", label: "缓存命中", value: hitRate === null ? "—" : `${(hitRate * 100).toFixed(1)}%`, hint: CACHE_HINT },
    { key: "cumulative", label: "累计 Token", value: cumulative === null ? "—" : formatTokenCount(cumulative), hint: CUMULATIVE_HINT },
  ];
  if (stats && stats.costUsd !== null) cells.push({ key: "cost", label: "费用", value: `$${stats.costUsd.toFixed(2)}` });

  return (
    <section aria-label="会话统计" className="grid grid-cols-3 gap-px overflow-hidden rounded-act-group border border-line bg-line">
      {cells.map((cell, index) => (
        <div key={cell.key} className={cn("bg-surface px-2.5 py-2", index === cells.length - 1 && cells.length % 3 === 2 && "col-span-2")}>
          <div className="flex items-center gap-1 text-act-xxs text-text-faint">
            {cell.label}
            {cell.hint ? <HelpHint text={cell.hint} /> : null}
          </div>
          <div className="mt-px text-act-md font-semibold tabular-nums text-text-main" data-stat={cell.key}>
            {cell.value}
            {cell.unit ? <small className="ml-0.5 text-act-xxs font-normal text-text-faint">{cell.unit}</small> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
