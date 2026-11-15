import { Database, Gauge, type LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { STAT_DIALOG_CONTENT_CLASS, StatDialogBody, type StatDialog, type StatRow } from "../stats/StatDialog";
import type { RuntimeUsageSummary } from "@actspace/shared/runtime-v2/projection";
import { useProjectionSelect } from "../../session";
import { jsonEqual } from "../../json-equal";
import type { ClientSessionCell } from "@actspace/client/sessions";
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
 * 状态行右侧的两个会话累计胶囊：「N 轮 M 步 · 输出速度」和「累计 总量 tok · 缓存命中」。
 * 显示/隐藏/可点分支逐条照 DeepSeek Harness 的 `StatsPills.tsx`（详细模式），
 * 落位与面板见 docs/design-docs/frontend/front-聊天输入框规范.md。
 * 状态行窄于 560px 时两个胶囊合成一个「M 步 · 总量 tok」（面板上下两段），窄于 360px 只留图标；
 * 宽度由 ComposerStatusRow 的 `@container` 量。
 */

const PILL_CLASS = "inline-flex min-h-5 max-w-full items-center gap-1.5 whitespace-nowrap rounded-act-pill px-2 py-px text-left text-act-xs leading-5 text-text-faint tabular-nums";
const BUTTON_PILL_CLASS = `${PILL_CLASS} cursor-pointer hover:bg-hover-overlay hover:text-text-muted aria-expanded:bg-hover-overlay aria-expanded:text-text-muted`;
const PILL_ICON_CLASS = "shrink-0";
const PILL_LABEL_CLASS = "min-w-0 truncate";
const PILL_SEP_CLASS = "mx-1.5 text-line-strong";

/** 胶囊的标识，也是 `data-composer-stat` 的值；`summary` 是窄窗下两个合成的那一个。 */
export type ComposerStat = "activity" | "usage" | "summary";

// 宽窗显示两个胶囊，窄窗换成合并胶囊（容器查询，量的是状态行宽度）。
const WIDE_ONLY_CLASS = "@max-[560px]:hidden";
const WIDE_PILL_CLASS = `${BUTTON_PILL_CLASS} ${WIDE_ONLY_CLASS}`;
// 合并胶囊不能带基础的 inline-flex，否则和 hidden 抢同一个 display；≤360px 只留图标。
const SUMMARY_PILL_CLASS = `${BUTTON_PILL_CLASS.replace("inline-flex ", "")} hidden @max-[560px]:inline-flex @max-[360px]:px-1 @max-[360px]:[&_[data-pill-label]]:hidden`;

/** 胶囊面板的受控开关：同一时间最多开一个。 */
export type ComposerStatsOverlay = {
  readonly openStat: ComposerStat | null;
  readonly onOpenChange: (stat: ComposerStat, open: boolean) => void;
};

type PillModel =
  | { readonly kind: "plain"; readonly label: readonly string[] }
  | { readonly kind: "dialog"; readonly label: readonly string[]; readonly ariaLabel: string; readonly dialog: StatDialog };

/** 合并胶囊：文字是两个胶囊各取最要紧的一段，面板把两个面板上下摞起来。 */
export type SummaryPillModel = {
  readonly label: readonly string[];
  readonly ariaLabel: string;
  readonly dialogs: readonly StatDialog[];
};

const tokenCount = (value: string) => `${value} tok`;

/**
 * 会话统计胶囊的模型：一步都没结算就不显示；一个计时数字都没有时只读。
 * @param stats - 会话统计。
 * @returns 胶囊模型；不显示时为 null。
 */
export function activityPillModel(stats: ComposerSessionStats): PillModel | null {
  if (stats.steps === 0) return null;
  const counts = activityCounts(stats);
  const speed = activitySpeed(stats);
  const label = speed === null ? [counts] : [counts, speed];
  const rows = activityRows(stats);
  if (rows.length === 0) return { kind: "plain", label };
  return { kind: "dialog", label, ariaLabel: label.join(" · "), dialog: { title: "会话统计", rows } };
}

const activityCounts = (stats: ComposerSessionStats) => `${stats.turns} 轮 ${stats.steps} 步`;

function activitySpeed(stats: ComposerSessionStats): string | null {
  return stats.decodeMs > 0 ? `${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s` : null;
}

function activityRows(stats: ComposerSessionStats): StatRow[] {
  const speed = activitySpeed(stats);
  const rows: StatRow[] = [];
  if (stats.llmMs > 0) rows.push(["模型用时", formatDuration(stats.llmMs)]);
  if (stats.toolMs > 0) rows.push(["工具调用用时", formatDuration(stats.toolMs)]);
  if (stats.ttftSteps > 0) rows.push(["首 token 平均（TTFT）", formatDuration(stats.ttftMs / stats.ttftSteps)]);
  if (speed !== null) rows.push(["输出速度（TPS）", speed]);
  return rows;
}

/**
 * 窄窗合并胶囊的模型：文字「M 步 · 总量 tok」，面板上段会话统计（多一行轮次步数）、下段累计消耗。
 * 两个胶囊都不显示时为 null；只有一个显示时只带那一段。
 * @param stats - 会话统计。
 * @param usage - 全会话累计用量。
 */
export function summaryPillModel(stats: ComposerSessionStats, usage: RuntimeUsageSummary | null | undefined): SummaryPillModel | null {
  const usageModel = usagePillModel(usage);
  const label: string[] = [];
  const dialogs: StatDialog[] = [];
  if (stats.steps > 0) {
    label.push(`${stats.steps} 步`);
    dialogs.push({ title: "会话统计", rows: [["轮次", activityCounts(stats)], ...activityRows(stats)] });
  }
  if (usageModel?.kind === "dialog") {
    label.push(tokenCount(formatTokens(billedInputTokens(usage!) + usage!.outputTokens)));
    dialogs.push(usageModel.dialog);
  }
  if (label.length === 0) return null;
  const aria = [...(stats.steps > 0 ? [activityCounts(stats)] : []), ...(usageModel?.kind === "dialog" ? usageModel.label : [])];
  return { label, ariaLabel: `会话统计：${aria.join(" · ")}`, dialogs };
}

/**
 * 会话累计消耗胶囊的模型：没有计费输入也没有输出时不显示。
 * @param usage - 全会话累计用量。
 * @returns 胶囊模型；不显示时为 null。
 */
export function usagePillModel(usage: RuntimeUsageSummary | null | undefined): PillModel | null {
  if (!usage) return null;
  const billedInput = billedInputTokens(usage);
  if (billedInput === 0 && usage.outputTokens === 0) return null;
  const hit = formatCacheHitPercent(usage.cacheReadTokens, billedInput);
  const hitText = hit === null ? null : `缓存命中 ${hit}%`;
  const total = billedInput + usage.outputTokens;
  const totalText = `累计 ${tokenCount(formatTokens(total))}`;
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
    dialog: {
      title: "会话累计消耗",
      titleValue: tokenCount(formatExactTokens(total)),
      rows,
    },
  };
}

type StatsModels = { readonly activity: PillModel | null; readonly usage: PillModel | null; readonly summary: SummaryPillModel | null };

function selectStatsModels(cell: ClientSessionCell | null): StatsModels {
  const snapshot = cell?.snapshot ?? null;
  const stats = sessionStats(snapshot);
  return { activity: activityPillModel(stats), usage: usagePillModel(snapshot?.usage), summary: summaryPillModel(stats, snapshot?.usage) };
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
  // 只订阅两个胶囊的模型：流式时 cell 每帧换一次，模型几乎不变，状态行不随帧重渲染。
  const { activity, usage, summary } = useProjectionSelect<StatsModels>(selectStatsModels, jsonEqual);
  if (activity === null && usage === null) return null;
  return (
    <span className="flex min-w-0 shrink items-center gap-1" data-composer-stats="">
      {activity ? <StatPill stat="activity" icon={Gauge} label={activity.label} panel={pillPanel(activity)} open={openStat === "activity"} onOpenChange={onOpenChange} className={activity.kind === "dialog" ? WIDE_PILL_CLASS : WIDE_ONLY_CLASS} /> : null}
      {usage ? <StatPill stat="usage" icon={Database} label={usage.label} panel={pillPanel(usage)} open={openStat === "usage"} onOpenChange={onOpenChange} className={WIDE_PILL_CLASS} /> : null}
      {/* 窄窗合并胶囊总是可点：面板至少有轮次一行。 */}
      {summary ? <StatPill stat="summary" icon={Gauge} label={summary.label} panel={{ ariaLabel: summary.ariaLabel, title: "会话统计与累计消耗", dialogs: summary.dialogs }} open={openStat === "summary"} onOpenChange={onOpenChange} className={SUMMARY_PILL_CLASS} /> : null}
    </span>
  );
}

function PillContent({ icon: Icon, label }: { icon: LucideIcon; label: readonly string[] }) {
  return (
    <>
      <Icon className={PILL_ICON_CLASS} size={14} aria-hidden="true" />
      <span className={PILL_LABEL_CLASS} data-pill-label="">
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
  label: readonly string[];
  /** 不传是只读胶囊（span）。 */
  panel?: { readonly ariaLabel: string; readonly title: string; readonly dialogs: readonly StatDialog[] };
  open: boolean;
  onOpenChange: (stat: ComposerStat, open: boolean) => void;
  className: string;
};

function StatPill({ stat, icon, label, panel, open, onOpenChange, className }: StatPillProps) {
  if (!panel) {
    return (
      <span className={`${PILL_CLASS} ${className}`} data-composer-stat={stat}>
        <PillContent icon={icon} label={label} />
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={(next) => onOpenChange(stat, next)}>
      <PopoverTrigger asChild>
        {/* 原生 button：和旁边的 context 圆环一样，状态行里的纯文字入口，不要 Button 的边框和内边距。 */}
        <button className={className} type="button" aria-haspopup="dialog" aria-label={panel.ariaLabel} data-composer-stat={stat}>
          <PillContent icon={icon} label={label} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        radius="lg"
        aria-label={panel.title}
        className={STAT_DIALOG_CONTENT_CLASS}
      >
        {panel.dialogs.map((dialog, index) => (
          <div key={dialog.title} className={index > 0 ? "mt-4" : undefined}>
            <StatDialogBody icon={dialog.title === "会话累计消耗" ? Database : Gauge} dialog={dialog} />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function pillPanel(model: PillModel): StatPillProps["panel"] {
  return model.kind === "dialog" ? { ariaLabel: model.ariaLabel, title: model.dialog.title, dialogs: [model.dialog] } : undefined;
}
