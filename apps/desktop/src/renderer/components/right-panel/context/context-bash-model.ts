import type { ContextPanelBashCount, ContextPanelBashStats } from "@actspace/shared";

/** 「Bash 命令」卡片的显示规则，见 `front-Context面板规范.md` §5。 */

export const BASH_OTHER_LABEL = "其他";

/** `106ms` / `4.2s` / `1m52s` / `1h05m`。 */
export function formatBashDuration(ms: number): string {
  const value = Math.max(0, ms);
  if (value < 1_000) return `${Math.round(value)}ms`;
  if (value < 59_950) return `${(value / 1_000).toFixed(1)}s`;
  const seconds = Math.round(value / 1_000);
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
  const minutes = Math.round(value / 60_000);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

export type BashCountRow = {
  key: string;
  /** `""` 显示为「其他」。 */
  label: string;
  other: boolean;
  count: number;
  failed: number;
  /** 子命令条形宽度：占所属程序次数的比例。程序行没有条形，恒为 1。 */
  share: number;
};
export type BashProgramRow = BashCountRow & {
  subcommands: BashCountRow[];
  /** 收起时的子命令摘要「status 9 · diff 7」；没有子命令时为空。 */
  summary: string;
};

/** 后端已排好序（count 降序、「其他」最后），这里只换算比例与文案。 */
export function bashProgramRows(stats: ContextPanelBashStats): BashProgramRow[] {
  const countRow = (item: ContextPanelBashCount, key: string, share: number): BashCountRow => ({
    key,
    label: item.name || BASH_OTHER_LABEL,
    other: item.name === "",
    count: item.count,
    failed: item.failed,
    share,
  });
  return stats.programs.map((program) => {
    const subcommands = program.subcommands.map((sub) =>
      countRow(sub, `${program.name} ${sub.name}`, program.count > 0 ? sub.count / program.count : 0),
    );
    return {
      ...countRow(program, program.name, 1),
      subcommands,
      summary: subcommands.map((sub) => `${sub.label} ${sub.count}`).join(" · "),
    };
  });
}

/** 标题右侧「N 个程序」：不含「其他」。 */
export function bashProgramCount(stats: ContextPanelBashStats): number {
  return stats.programs.filter((program) => program.name !== "").length;
}

export type BashNotableTone = "slowest" | "failed" | "repeated" | "background";
export type BashNotableRow = {
  tone: BashNotableTone;
  label: string;
  /** 命令 / 程序原文；后台任务没有。 */
  text: string;
  value: string;
};

/** 「值得注意」：固定顺序，没有数据的项不出现（后端缺省字段视为没有）。 */
export function bashNotableRows(stats: ContextPanelBashStats): BashNotableRow[] {
  const rows: BashNotableRow[] = [];
  if (stats.slowest && stats.slowest.durationMs > 0)
    rows.push({
      tone: "slowest",
      label: "最慢",
      text: stats.slowest.command,
      value: formatBashDuration(stats.slowest.durationMs),
    });
  if (stats.mostFailedProgram && stats.mostFailedProgram.count > 0)
    rows.push({
      tone: "failed",
      label: "失败最多",
      text: stats.mostFailedProgram.program,
      value: `×${stats.mostFailedProgram.count}`,
    });
  if (stats.mostRepeated && stats.mostRepeated.count > 1)
    rows.push({
      tone: "repeated",
      label: "重复最多",
      text: stats.mostRepeated.command,
      value: `×${stats.mostRepeated.count}`,
    });
  if (stats.backgroundCount && stats.backgroundCount > 0)
    rows.push({ tone: "background", label: "后台任务", text: "", value: `×${stats.backgroundCount}` });
  return rows;
}
