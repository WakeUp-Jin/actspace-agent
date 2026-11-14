import type { SubagentActivationStatus, SubagentKind, SubagentPreset } from "./runtime-v2/subagents";

/**
 * Display words for subagents (front-子Agent与后台任务规范.md §2), shared by the desktop renderer, the trajectory,
 * the Harness stats and the Web client so every surface names a subagent the same way.
 */

/** 通用 / 探索 / Fork / Codex / Claude Code; old Sessions (only `agentKind`) keep Agent / Explore. */
export function subagentKindLabel(input: { readonly subagentKind?: SubagentKind; readonly preset?: SubagentPreset; readonly agentKind?: "agent" | "explore" }): string {
  switch (input.subagentKind) {
    case "local": return input.preset === "explore" ? "探索" : "通用";
    case "fork": return "Fork";
    case "codex": return "Codex";
    case "claude-code": return "Claude Code";
    default: return input.agentKind === "agent" ? "Agent" : "Explore";
  }
}

/** How one activation ended, as the completion notice says it. */
export function subagentActivationStatusLabel(status: string): string {
  // `stopped` arrives from background-task notices (task_stop / user stop); the rest are activation statuses.
  if (status === "stopped") return "已停止";
  switch (status as SubagentActivationStatus) {
    case "completed": return "已完成";
    case "interrupted": return "已中断";
    case "failed": return "失败";
    case "max_steps": return "达到步数上限";
    case "lost": return "中断（应用退出）";
    default: return status;
  }
}

/** The body of an `<agent_message from=… relation=…>` inbox item; other text is returned as is. */
export function agentMessageBody(content: string): string {
  return /^\s*<agent_message\b[^>]*>\n?([\s\S]*?)\n?<\/agent_message>\s*$/.exec(content)?.[1] ?? content;
}

/** Panel status of one subagent: working, or how it ended (a finished subagent is closed for good). */
export const SUBAGENT_LIST_STATUSES = ["running", "interrupted", "failed", "ended"] as const;
export type SubagentListStatus = (typeof SUBAGENT_LIST_STATUSES)[number];

export function subagentListStatusLabel(status: SubagentListStatus): string {
  switch (status) {
    case "running": return "运行中";
    case "interrupted": return "已中断";
    case "failed": return "失败";
    case "ended": return "已结束";
  }
}
