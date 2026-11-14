import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "子智能体调度",
    description: "子智能体的创建、续派、插话、中断与完成通知",
    scope: "global",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.subagent",
  version: "0.2.0",
  name: "ActSpace Subagent Manager",
  entry: { entryId: "subagent.manager", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["core.agent", "core.agent-loop", "session.journal", "tools.runtime"],
  contributions: {
    services: ["subagent.manager"],
    tools: [],
    prompts: [],
    events: ["subagent/spawned", "subagent/activation"],
  },
});
