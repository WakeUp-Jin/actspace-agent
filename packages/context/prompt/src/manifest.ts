import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "提示词",
    description: "系统提示词的模板与渲染",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.prompt",
  version: "0.1.0",
  name: "ActSpace Prompt",
  entry: { entryId: "prompt.default", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["actspace.host.prompt"],
  contributions: { services: ["prompt.runtime"], tools: [], prompts: ["prompt.default"], events: [] },
});
