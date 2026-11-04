import type { RuntimeV2AgentMode } from "@actspace/shared/runtime-v2";

/** Delegation and its management tools; `plan` gets them too because a subagent never has more tools than its parent's mode. */
const SUBAGENT_TOOLS = ["agent", "agent_fork", "send_message", "wait_agent", "list_agents", "interrupt_agent", "list_subagent_models"] as const;

/** Explicit builtin policy; approved evolved tools are supplied separately for Agent mode. */
export const AGENT_MODE_TOOLS: Readonly<Record<RuntimeV2AgentMode, readonly string[]>> = Object.freeze({
  chat: Object.freeze(["web", "generate_image"]),
  plan: Object.freeze(["read_file", "list_directory", "grep", "glob", "web_search", "web_fetch", "inspect_image", "todo_read", "todo_write", "task_list", "task_output", "task_stop", "task_wait",
    ...SUBAGENT_TOOLS]),
  agent: Object.freeze([
    "read_file", "list_directory", "grep", "glob", "edit_file", "write_file", "delete_file", "present",
    "bash", "task_list", "task_output", "task_stop", "task_wait", "web_search", "web_fetch", "generate_image", "inspect_image",
    "todo_read", "todo_write", ...SUBAGENT_TOOLS, "agent_codex", "agent_claude_code", "plugin_manager", "harness_inspect",
    "browser_cua", "browser_dom", "browser_locator", "browser_navigation", "browser_tabs",
    "browser_user", "browser_wait", "browser_io", "browser_debug", "browser_help", "browser_run",
  ]),
});

export function allowedAgentModeTools(mode: RuntimeV2AgentMode, available: readonly string[], evolved: readonly string[] = []): ReadonlySet<string> {
  const names = AGENT_MODE_TOOLS[mode];
  if (names === undefined) throw new Error(`Unsupported Agent mode ${String(mode)}.`);
  const availableSet = new Set(available);
  return new Set([...names, ...(mode === "agent" ? evolved : [])].filter(name => availableSet.has(name)));
}
