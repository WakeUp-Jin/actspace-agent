import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const BACKGROUND_TASK_TOOLS_PLUGIN_ID = "actspace.background-tasks" as const;
export const BACKGROUND_TASK_TOOL_NAMES = Object.freeze(["task_list", "task_output", "task_stop"] as const);

export const manifest = defineBuiltinPluginManifest({
  display: { title: "后台任务", description: "查看和停止后台运行的命令与子智能体", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: BACKGROUND_TASK_TOOLS_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Background Task Tools",
  entry: { entryId: "tools.background-tasks", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "actspace.host.background-tasks"],
  contributions: { services: ["tools.background-tasks"], tools: [...BACKGROUND_TASK_TOOL_NAMES], prompts: [], events: [] },
});
