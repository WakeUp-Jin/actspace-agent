import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "插件开发",
    description: "帮 Agent 编写和安装插件",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.plugin-manager",
  version: "1",
  name: "Plugin Manager",
  entry: { entryId: "tools.plugin-manager", behavior: "@actspace/plugin-manager/plugin" },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "actspace.host.agent"],
  contributions: {
    services: ["tools.plugin-manager"],
    tools: ["plugin_manager", "harness_inspect"],
    prompts: [],
    events: [],
  },
});
