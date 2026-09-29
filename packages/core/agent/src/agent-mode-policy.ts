import type { RuntimeV2AgentMode } from "@actspace/shared/runtime-v2";

/** Explicit policy: a newly registered tool is unavailable until added here. */
export const AGENT_MODE_TOOLS: Readonly<Record<RuntimeV2AgentMode, readonly string[]>> = Object.freeze({
  chat: Object.freeze(["web", "generate_image"]),
  plan: Object.freeze(["read_file", "list_directory", "grep", "glob", "web_search", "web_fetch", "inspect_image", "explore", "todo_read", "todo_write"]),
  agent: Object.freeze([
    "read_file", "list_directory", "grep", "glob", "edit_file", "write_file", "delete_file",
    "bash", "bash_output", "bash_kill", "web_search", "web_fetch", "generate_image", "inspect_image",
    "todo_read", "todo_write", "agent", "explore",
    "browser_cua", "browser_dom", "browser_locator", "browser_navigation", "browser_tabs",
    "browser_user", "browser_wait", "browser_io", "browser_debug", "browser_help", "browser_run",
  ]),
});

export function allowedAgentModeTools(mode: RuntimeV2AgentMode, available: readonly string[]): ReadonlySet<string> {
  const names = AGENT_MODE_TOOLS[mode];
  if (names === undefined) throw new Error(`Unsupported Agent mode ${String(mode)}.`);
  const availableSet = new Set(available);
  return new Set(names.filter(name => availableSet.has(name)));
}
