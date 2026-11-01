import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const SUBAGENT_TOOLS_PLUGIN_ID = "actspace.subagent-tools" as const;
export const SUBAGENT_TOOL_NAMES = Object.freeze(["agent", "explore"] as const);

export const manifest = defineBuiltinPluginManifest({
  display: { title: "子 Agent", description: "把任务交给子 Agent 去做", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: SUBAGENT_TOOLS_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Subagent Tools",
  entry: { entryId: "subagent-tools", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "agent.registry", "actspace.host.subagents", "actspace.host.background-tasks"],
  contributions: { services: ["tools.subagents"], tools: [...SUBAGENT_TOOL_NAMES], prompts: [], events: [] },
});
