/** Default Harness admission and build inputs share this declaration. */
export const DEFAULT_HARNESS_ENTRIES = [
  ["llm-service", ["llm.service", "llm.routes", "llm.service.types"], ["actspace.host.llm"]],
  ["tools-approval", ["tools.approval"], []],
  ["tools-runtime", ["tools.runtime", "tools.runtime.types"], ["tools.approval"]],
  ["context-assembly", ["context.assembly", "context.assembly.types"], ["session.journal"]],
  ["prompt-runtime", ["prompt.runtime", "prompt.assembly"], ["context.assembly", "actspace.host.prompt"]],
  ["compaction-runtime", ["compaction.runtime", "compaction.surface"], ["llm.service"]],
  ...["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation"].map(id => [id, [`tools.${id}`], ["tools.runtime", `actspace.host.tools.${id}`]]),
  ["image-inspection", ["tools.image-inspection"], ["tools.runtime", "llm.service", "actspace.host.tools.image-inspection"]],
  ["todo-tools", ["tools.todo"], ["tools.runtime", "session.runtime"]],
  ["browser-tools", ["tools.browser"], ["tools.runtime"]],
  ["subagent-tools", ["tools.subagents"], ["tools.runtime", "agent.registry", "actspace.host.subagents"]],
  ["agent-factory", ["actspace.agent.factory", "agent.run-factory"], ["actspace.host.agent", "agent.registry", "session.runtime", "session.checkpoint", "llm.service", "tools.runtime", "prompt.runtime", "compaction.runtime"]],
] as const;

export function defaultHarnessEntrySource(id: string): string {
  const special: Record<string, string> = { "agent-factory": "harness:factory", "todo-tools": "harness:todo", "subagent-tools": "./dist/harness/harness-subagent-tools.js", "context-assembly": "@actspace/context/plugin", "prompt-runtime": "@actspace/prompt/plugin", "compaction-runtime": "@actspace/compaction/plugin" };
  if (special[id]) return special[id];
  if (id === "llm-service" || id === "tools-runtime" || id === "tools-approval") return `@actspace/${id}/plugin`;
  return `@actspace/tools-${id}/plugin`;
}
