import type { AgentScope } from "@actspace/scope";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { createHash } from "node:crypto";

export const MAIN_AGENT_FORM_ID = "actspace.main" as const;
/** Session Headers only accept this form version (`session-journal` header validation); member changes show up in the digest. */
export const MAIN_AGENT_FORM_VERSION = 1 as const;

/** One plugin whose tool contributions bind to an AgentScope; `version` is the plugin's major version (at least 1). */
export type AgentFormMember = Readonly<{
  id: string;
  version: number;
  required: boolean;
  toolNames: readonly string[];
}>;

export type AgentForm = Readonly<{
  id: typeof MAIN_AGENT_FORM_ID;
  version: typeof MAIN_AGENT_FORM_VERSION;
  defaultMode: "agent";
  members: readonly AgentFormMember[];
}>;

export type ActivatedAgentForm = Readonly<{
  id: typeof MAIN_AGENT_FORM_ID;
  version: number;
  members: readonly Readonly<{ id: string; version: number; toolNames: readonly string[] }>[];
}>;

/**
 * The one built-in form. Members are not listed here: `@actspace/runtime` derives them from the plugin catalog
 * (`main-agent-form.ts`), so adding or replacing a tool plugin never edits this package.
 */
export function defineMainAgentForm(members: readonly AgentFormMember[]): AgentForm {
  const ids = new Set<string>();
  const tools = new Map<string, string>();
  const frozen = members.map(member => {
    if (ids.has(member.id)) throw new Error(`Agent form member ${member.id} is listed twice.`);
    ids.add(member.id);
    if (!Number.isSafeInteger(member.version) || member.version < 1) throw new Error(`Agent form member ${member.id} needs a positive version.`);
    if (member.toolNames.length === 0) throw new Error(`Agent form member ${member.id} contributes no tools.`);
    for (const name of member.toolNames) {
      const owner = tools.get(name);
      if (owner !== undefined) throw new Error(`Tool ${name} is claimed by both ${owner} and ${member.id}.`);
      tools.set(name, member.id);
    }
    return Object.freeze({ ...member, toolNames: Object.freeze([...member.toolNames]) });
  });
  return Object.freeze({ id: MAIN_AGENT_FORM_ID, version: MAIN_AGENT_FORM_VERSION, defaultMode: "agent", members: Object.freeze(frozen) });
}

/** Members present for this Host (required ones plus admitted optional ones) and a digest independent of unrelated Host plugins. */
export function agentFormComposition(form: AgentForm, plugins: readonly Readonly<{ id: string; version: string }>[]) {
  const admitted = new Set(plugins.map(plugin => plugin.id));
  const members = form.members
    .filter(member => member.required || admitted.has(member.id))
    .map(member => Object.freeze({ id: member.id, version: member.version }));
  const digest = createHash("sha256").update(JSON.stringify({ id: form.id, version: form.version, members })).digest("hex");
  return Object.freeze({ members: Object.freeze(members), digest });
}

/** Bind each member's registered tools to `scope`; a required member missing any declared tool fails the activation. */
export function activateAgentFormTools(form: AgentForm, scope: AgentScope, runtime: ToolRuntime): ActivatedAgentForm {
  const available = new Map(runtime.registry.listDefinitions().map(definition => [definition.name, definition]));
  const members: Array<{ id: string; version: number; toolNames: readonly string[] }> = [];
  for (const member of form.members) {
    const definitions = member.toolNames.map(name => available.get(name));
    const present = definitions.filter((definition) => definition?.pluginId === member.id);
    if (present.length === 0 && !member.required) continue;
    if (present.length !== member.toolNames.length) {
      throw new Error(`Agent form member ${member.id} is incomplete or unavailable.`);
    }
    for (const definition of present) scope.tools.register({ id: definition!.name, owner: member.id, value: definition!.pluginId });
    members.push(Object.freeze({ id: member.id, version: member.version, toolNames: member.toolNames }));
  }
  return Object.freeze({ id: form.id, version: form.version, members: Object.freeze(members) });
}
