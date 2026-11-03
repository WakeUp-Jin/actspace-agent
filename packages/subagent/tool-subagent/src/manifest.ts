import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const SUBAGENT_TOOLS_PLUGIN_ID = "actspace.subagent-tools" as const;
export const SUBAGENT_TOOL_NAMES = Object.freeze(["agent", "send_message", "wait_agent", "list_agents", "interrupt_agent", "list_subagent_models"] as const);

export const manifest = defineBuiltinPluginManifest({
  display: { title: "子智能体", description: "把任务交给子智能体，在后台并行完成", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: SUBAGENT_TOOLS_PLUGIN_ID,
  version: "0.2.0",
  name: "ActSpace Subagent Tools",
  entry: { entryId: "subagent-tools", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "agent.registry", "actspace.host.subagents"],
  contributions: { services: ["tools.subagents"], tools: [...SUBAGENT_TOOL_NAMES], prompts: [], events: [] },
});
