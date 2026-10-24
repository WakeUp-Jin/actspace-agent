/** Default Harness admission and build inputs share this declaration. */
import { contextPluginPackage } from "@actspace/context-engine";

export const DEFAULT_HARNESS_ENTRIES = [
  ["llm-service", ["llm.service", "llm.routes", "llm.service.types"], ["actspace.host.llm"]],
  ["auto-review", ["approval.auto-review"], ["llm.service"]],
  ["tools-approval", ["tools.approval"], []],
  ["tools-runtime", ["tools.runtime", "tools.runtime.types"], ["tools.approval"]],
  ["context-engine", ["context.engine"], ["session.journal"]],
  ["prompt-runtime", ["prompt.runtime"], ["actspace.host.prompt"]],
  ...["system", "rules", "skills", "runtime", "conversation", "tools"].map(kind => [`context-${kind}`, [`context.source.${kind}`], []]),
  ["context-background-tasks", ["context.source.background-tasks"], ["actspace.host.background-tasks"]],
  ["context-disclosure", ["context.disclosure"], ["context.engine", "actspace.host.agent"]],
  ["compaction-runtime", ["compaction.runtime", "compaction.surface"], ["llm.service", "context.engine"]],
  ...["filesystem-read", "filesystem-search", "filesystem-write", "web-tools", "image-generation"].map(id => [id, [`tools.${id}`], ["tools.runtime", `actspace.host.tools.${id}`]]),
  ["shell-tools", ["tools.shell-tools"], ["tools.runtime", "actspace.host.tools.shell-tools", "actspace.host.background-tasks"]],
  ["image-inspection", ["tools.image-inspection"], ["tools.runtime", "llm.service", "actspace.host.tools.image-inspection"]],
  ["todo-tools", ["tools.todo"], ["tools.runtime", "session.runtime"]],
  ["browser-tools", ["tools.browser"], ["tools.runtime"]],
  ["background-tasks", ["tools.background-tasks"], ["tools.runtime", "actspace.host.background-tasks"]],
  ["subagent-tools", ["tools.subagents"], ["tools.runtime", "agent.registry", "actspace.host.subagents", "actspace.host.background-tasks"]],
  ["plugin-manager", ["tools.plugin-manager"], ["tools.runtime", "actspace.host.agent"]],
  ["agent-factory", ["actspace.agent.factory", "agent.run-factory"], ["actspace.host.agent", "agent.registry", "session.runtime", "session.checkpoint", "llm.service", "tools.runtime", "prompt.runtime", "context.engine", "context.source.system", "context.source.conversation"]],
] as const;

export function defaultHarnessEntrySource(id: string): string {
  const special: Record<string, string> = { "agent-factory": "harness:factory", "todo-tools": "harness:todo", "subagent-tools": "./dist/harness/harness-subagent-tools.js", "context-engine": "@actspace/context-engine/plugin", "prompt-runtime": "@actspace/prompt/plugin", "compaction-runtime": "@actspace/context-compaction/plugin" };
  if (id === "auto-review") return "@actspace/auto-review/plugin";
  if (id === "plugin-manager") return "@actspace/plugin-manager/plugin";
  const contextPackage = contextPluginPackage(id);
  if (contextPackage !== undefined) return contextPackage.behaviorEntry;
  if (special[id]) return special[id];
  if (id === "llm-service" || id === "tools-runtime" || id === "tools-approval") return `@actspace/${id}/plugin`;
  return `@actspace/tools-${id}/plugin`;
}
