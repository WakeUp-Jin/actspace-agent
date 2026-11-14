import type { ContextPanelStats } from "@actspace/shared";
import { formatTokenCount } from "../../../context-format";
import { cn } from "../../ui/cn";
import { cacheHitRate, cumulativeTokens } from "./context-panel-model";
import { CARD_CLASS } from "./ContextPanelParts";

type StatCell = { key: string; label: string; value: string; unit?: string };

/** ② 会话统计：三列格子，不画格线。`costUsd` 为 null 时隐藏费用格，没有用量数据时缓存和累计两格显示「—」。 */
export function ContextStats({ stats }: { stats: ContextPanelStats | null }) {
  const hitRate = cacheHitRate(stats?.cumulativeUsage ?? null);
  const cumulative = cumulativeTokens(stats?.cumulativeUsage ?? null);
  const cells: StatCell[] = [
    { key: "turns", label: "轮次", value: stats ? String(stats.turnCount) : "—" },
    { key: "steps", label: "步数", value: stats ? String(stats.stepCount) : "—" },
    { key: "compactions", label: "压缩", value: stats ? String(stats.compactionCount) : "—", unit: "次" },
    { key: "cache", label: "缓存命中", value: hitRate === null ? "—" : `${(hitRate * 100).toFixed(1)}%` },
    { key: "cumulative", label: "累计 Token", value: cumulative === null ? "—" : formatTokenCount(cumulative) },
  ];
  if (stats && stats.costUsd !== null)
    cells.push({ key: "cost", label: "费用", value: `$${stats.costUsd.toFixed(2)}` });

  return (
    <section aria-label="会话统计" className={cn(CARD_CLASS, "grid grid-cols-3 pt-2")}>
      {cells.map((cell, index) => (
        <div
          key={cell.key}
          className={cn("px-3 py-1.5", index === cells.length - 1 && cells.length % 3 === 2 && "col-span-2")}
        >
          <div className="text-act-xxs text-text-faint">{cell.label}</div>
          <div className="mt-px text-act-md font-semibold tabular-nums text-text-main" data-stat={cell.key}>
            {cell.value}
            {cell.unit ? <small className="ml-0.5 text-act-xxs font-normal text-text-faint">{cell.unit}</small> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
