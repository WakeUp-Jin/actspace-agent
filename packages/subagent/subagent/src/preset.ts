import type { SubagentPreset } from "@actspace/shared/runtime-v2";

/** Read-only tools of the `explore` preset (design 02 §5.1). */
export const EXPLORE_TOOL_NAMES = Object.freeze(["read_file", "list_directory", "grep", "glob"]);
/** Every subagent can message its parent. */
export const SUBAGENT_COORDINATION_TOOL_NAMES = Object.freeze(["send_message"]);
/** Tools a subagent never runs: delegation (depth is 1), main-only management, background tasks, plugin development. */
const BLOCKED = new Set([
  "agent",
  "agent_fork",
  "agent_codex",
  "agent_claude_code",
  "list_subagent_models",
  "present",
  "plugin_manager",
  "harness_inspect",
]);

export function isSubagentBlockedTool(name: string): boolean {
  return BLOCKED.has(name) || name.startsWith("task_");
}

/**
 * The tools a `local` subagent gets, fixed at creation: `general` takes what its parent's mode
 * allows minus the blocked ones, `explore` the four read-only tools; both add `send_message`.
 */
export function subagentToolNames(
  preset: SubagentPreset,
  parentAllowed: Iterable<string>,
  registered: Iterable<string>,
): readonly string[] {
  const available = new Set(registered);
  const base =
    preset === "explore" ? EXPLORE_TOOL_NAMES : [...parentAllowed].filter((name) => !isSubagentBlockedTool(name));
  return Object.freeze(
    [...new Set([...base, ...SUBAGENT_COORDINATION_TOOL_NAMES])].filter((name) => available.has(name)).sort(),
  );
}
