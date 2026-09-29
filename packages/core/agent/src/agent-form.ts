import type { AgentScope } from "@actspace/core-scope";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { createHash } from "node:crypto";

export type AgentFormToolMember = Readonly<{
  id: string;
  version: number;
  required: boolean;
  toolNames: readonly string[];
}>;

/** Host registrations are shared; these members bind their contributions to one AgentScope. */
export const MAIN_AGENT_FORM = Object.freeze({
  id: "actspace.main" as const,
  version: 1,
  defaultMode: "agent" as const,
  members: Object.freeze([
    Object.freeze({ id: "actspace.prompt", version: 1, required: true, toolNames: Object.freeze([]) }),
    Object.freeze({ id: "actspace.filesystem-read", version: 2, required: true, toolNames: Object.freeze(["read_file", "list_directory"]) }),
    Object.freeze({ id: "actspace.filesystem-search", version: 2, required: true, toolNames: Object.freeze(["grep", "glob"]) }),
    Object.freeze({ id: "actspace.filesystem-write", version: 2, required: true, toolNames: Object.freeze(["edit_file", "write_file", "delete_file"]) }),
    Object.freeze({ id: "actspace.shell-tools", version: 2, required: true, toolNames: Object.freeze(["bash", "bash_output", "bash_kill"]) }),
    Object.freeze({ id: "actspace.web-tools", version: 2, required: true, toolNames: Object.freeze(["web", "web_search", "web_fetch"]) }),
    Object.freeze({ id: "actspace.image-generation", version: 2, required: true, toolNames: Object.freeze(["generate_image"]) }),
    Object.freeze({ id: "actspace.image-inspection", version: 2, required: true, toolNames: Object.freeze(["inspect_image"]) }),
    Object.freeze({ id: "actspace.todo", version: 1, required: true, toolNames: Object.freeze(["todo_read", "todo_write"]) }),
    Object.freeze({ id: "actspace.subagent", version: 1, required: true, toolNames: Object.freeze(["agent", "explore"]) }),
    Object.freeze({ id: "actspace.compaction", version: 1, required: true, toolNames: Object.freeze([]) }),
    Object.freeze({ id: "actspace.browser-tools", version: 2, required: false, toolNames: Object.freeze([
      "browser_cua", "browser_dom", "browser_locator", "browser_navigation", "browser_tabs", "browser_user",
      "browser_wait", "browser_io", "browser_debug", "browser_help", "browser_run",
    ]) }),
  ] satisfies readonly AgentFormToolMember[]),
});

export type ActivatedAgentForm = Readonly<{
  id: typeof MAIN_AGENT_FORM.id;
  version: number;
  members: readonly Readonly<{ id: string; version: number; toolNames: readonly string[] }>[];
}>;

export function mainAgentFormComposition(plugins: readonly Readonly<{ id: string; version: string }>[]) {
  const admitted = new Set(plugins.map(plugin => plugin.id));
  const members = MAIN_AGENT_FORM.members
    .filter(member => member.required || admitted.has(member.id))
    .map(member => Object.freeze({ id: member.id, version: member.version }));
  const digest = createHash("sha256").update(JSON.stringify({ id: MAIN_AGENT_FORM.id, version: MAIN_AGENT_FORM.version, members })).digest("hex");
  return Object.freeze({ members: Object.freeze(members), digest });
}

export function activateMainAgentFormTools(scope: AgentScope, runtime: ToolRuntime): ActivatedAgentForm {
  const available = new Map(runtime.registry.listDefinitions().map(definition => [definition.name, definition]));
  const members: Array<{ id: string; version: number; toolNames: readonly string[] }> = [];
  for (const member of MAIN_AGENT_FORM.members) {
    if (member.toolNames.length === 0) {
      members.push(Object.freeze({ id: member.id, version: member.version, toolNames: member.toolNames }));
      continue;
    }
    const definitions = member.toolNames.map(name => available.get(name));
    const present = definitions.filter((definition) => definition?.pluginId === member.id);
    if (present.length === 0 && !member.required) continue;
    if (present.length !== member.toolNames.length) {
      throw new Error(`Agent form member ${member.id} is incomplete or unavailable.`);
    }
    for (const definition of present) scope.tools.register({ id: definition!.name, owner: member.id, value: definition!.pluginId });
    members.push(Object.freeze({ id: member.id, version: member.version, toolNames: member.toolNames }));
  }
  return Object.freeze({ id: MAIN_AGENT_FORM.id, version: MAIN_AGENT_FORM.version, members: Object.freeze(members) });
}
