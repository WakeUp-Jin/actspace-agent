import { Database, Gauge, type LucideIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { STAT_DIALOG_CONTENT_CLASS, StatDialogBody, type StatDialog, type StatRow } from "../stats/StatDialog";
import type { RuntimeV2UsageSummary } from "@actspace/shared/runtime-v2/projection";
import { useOptionalSessionProjection } from "../../session";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import {
  billedInputTokens,
  formatCacheHitPercent,
  formatDuration,
  formatExactTokens,
  formatTokens,
  formatTokensPerSecond,
  sessionStats,
  type ComposerSessionStats,
} from "./composer-stats";

/**
 * 状态行右侧的两个会话累计胶囊：「N 轮 M 步 · 输出速度」和「总量 tok · 缓存命中」。
 * 显示/隐藏/可点分支逐条照 DeepSeek Harness 的 `StatsPills.tsx`（详细模式），
 * 落位与面板见 docs/design-docs/frontend/front-聊天输入框规范.md。
 */

const PILL_CLASS = "inline-flex min-h-5 max-w-full items-center gap-1.5 whitespace-nowrap rounded-act-pill px-2 py-px text-left text-act-xs leading-5 text-text-faint tabular-nums";
const BUTTON_PILL_CLASS = `${PILL_CLASS} cursor-pointer hover:bg-hover-overlay hover:text-text-muted aria-expanded:bg-hover-overlay aria-expanded:text-text-muted`;
const PILL_ICON_CLASS = "shrink-0";
const PILL_LABEL_CLASS = "min-w-0 truncate";
const PILL_SEP_CLASS = "mx-1.5 text-line-strong";

/** 两个胶囊的标识，也是 `data-composer-stat` 的值。 */
export type ComposerStat = "activity" | "usage";

/** 胶囊面板的受控开关：同一时间最多开一个。 */
export type ComposerStatsOverlay = {
  readonly openStat: ComposerStat | null;
  readonly onOpenChange: (stat: ComposerStat, open: boolean) => void;
};

type PillModel =
  | { readonly kind: "plain"; readonly label: readonly string[] }
  | { readonly kind: "dialog"; readonly label: readonly string[]; readonly ariaLabel: string; readonly dialog: StatDialog };

const tokenCount = (value: string) => `${value} tok`;

/**
 * 会话统计胶囊的模型：一步都没结算就不显示；一个计时数字都没有时只读。
 * @param stats - 会话统计。
 * @returns 胶囊模型；不显示时为 null。
 */
export function activityPillModel(stats: ComposerSessionStats): PillModel | null {
  if (stats.steps === 0) return null;
  const counts = `${stats.turns} 轮 ${stats.steps} 步`;
  const speed = stats.decodeMs > 0
    ? `${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s`
    : null;
  const label = speed === null ? [counts] : [counts, speed];
  if (stats.llmMs <= 0 && stats.toolMs <= 0 && stats.ttftSteps <= 0 && speed === null) {
    return { kind: "plain", label };
  }
  const rows: StatRow[] = [];
  if (stats.llmMs > 0) rows.push(["模型用时", formatDuration(stats.llmMs)]);
  if (stats.toolMs > 0) rows.push(["工具调用用时", formatDuration(stats.toolMs)]);
  if (stats.ttftSteps > 0) rows.push(["首 token 平均（TTFT）", formatDuration(stats.ttftMs / stats.ttftSteps)]);
  if (speed !== null) rows.push(["输出速度（TPS）", speed]);
  return { kind: "dialog", label, ariaLabel: label.join(" · "), dialog: { title: "会话统计", rows } };
}

/**
 * Token 用量胶囊的模型：没有计费输入也没有输出时不显示。
 * @param usage - 全会话累计用量。
 * @returns 胶囊模型；不显示时为 null。
 */
export function usagePillModel(usage: RuntimeV2UsageSummary | null | undefined): PillModel | null {
  if (!usage) return null;
  const billedInput = billedInputTokens(usage);
  if (billedInput === 0 && usage.outputTokens === 0) return null;
  const hit = formatCacheHitPercent(usage.cacheReadTokens, billedInput);
  const hitText = hit === null ? null : `缓存命中 ${hit}%`;
  const total = billedInput + usage.outputTokens;
  const totalText = tokenCount(formatTokens(total));
  const rows: StatRow[] = [];
  if (hit !== null) rows.push(["缓存命中", `${hit}%`]);
  rows.push(["未缓存输入", tokenCount(formatExactTokens(usage.inputTokens))]);
  rows.push(["缓存读取", tokenCount(formatExactTokens(usage.cacheReadTokens))]);
  if (usage.cacheWriteTokens !== 0) rows.push(["缓存写入", tokenCount(formatExactTokens(usage.cacheWriteTokens))]);
  rows.push(["输出", tokenCount(formatExactTokens(usage.outputTokens))]);
  const label = hitText === null ? [totalText] : [totalText, hitText];
  return {
    kind: "dialog",
    label,
    ariaLabel: label.join(" · "),
    dialog: { title: "Token 用量", titleValue: tokenCount(formatExactTokens(total)), rows },
  };
}

/**
 * 读当前会话投影，在状态行右侧渲染两个胶囊；没有投影或两个都不显示时什么都不渲染。
 * @param overlay - 受控的面板开关；不传时由组件自己维护。
 */
export function ComposerStatsPills({ overlay }: { overlay?: ComposerStatsOverlay }) {
  const [localOpen, setLocalOpen] = useState<ComposerStat | null>(null);
  const openStat = overlay ? overlay.openStat : localOpen;
  const onOpenChange = overlay?.onOpenChange
    ?? ((stat: ComposerStat, open: boolean) => setLocalOpen((current) => (open ? stat : current === stat ? null : current)));
  const projection = useOptionalSessionProjection();
  const snapshot = projection?.cell.snapshot ?? null;
  const activity = useMemo(() => activityPillModel(sessionStats(snapshot)), [snapshot]);
  const usage = useMemo(() => usagePillModel(snapshot?.usage), [snapshot?.usage]);
  if (activity === null && usage === null) return null;
  return (
    <span className="flex min-w-0 shrink flex-wrap items-center gap-1" data-composer-stats="">
      {activity ? <StatPill stat="activity" icon={Gauge} model={activity} open={openStat === "activity"} onOpenChange={onOpenChange} /> : null}
      {usage ? <StatPill stat="usage" icon={Database} model={usage} open={openStat === "usage"} onOpenChange={onOpenChange} /> : null}
    </span>
  );
}

function PillContent({ icon: Icon, label }: { icon: LucideIcon; label: readonly string[] }) {
  return (
    <>
      <Icon className={PILL_ICON_CLASS} size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className={PILL_LABEL_CLASS}>
        {label.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? <span className={PILL_SEP_CLASS} aria-hidden="true">·</span> : null}
            {part}
          </Fragment>
        ))}
      </span>
    </>
  );
}

type StatPillProps = {
  stat: ComposerStat;
  icon: LucideIcon;
  model: PillModel;
  open: boolean;
  onOpenChange: (stat: ComposerStat, open: boolean) => void;
};

function StatPill({ stat, icon, model, open, onOpenChange }: StatPillProps) {
  if (model.kind === "plain") {
    return (
      <span className={PILL_CLASS} data-composer-stat={stat}>
        <PillContent icon={icon} label={model.label} />
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={(next) => onOpenChange(stat, next)}>
      <PopoverTrigger asChild>
        {/* 原生 button：和旁边的 context 圆环一样，状态行里的纯文字入口，不要 Button 的边框和内边距。 */}
        <button className={BUTTON_PILL_CLASS} type="button" aria-haspopup="dialog" aria-label={model.ariaLabel} data-composer-stat={stat}>
          <PillContent icon={icon} label={model.label} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        radius="lg"
        aria-label={model.dialog.title}
        className={STAT_DIALOG_CONTENT_CLASS}
      >
        <StatDialogBody icon={icon} dialog={model.dialog} />
      </PopoverContent>
    </Popover>
  );
}
