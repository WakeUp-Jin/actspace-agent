import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "运行环境",
    description: "告诉 Agent 时间、系统和工作区",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.context-runtime",
  version: "0.1.0",
  name: "ActSpace Context runtime",
  entry: { entryId: "context.runtime", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["context.assembly"],
  contributions: { services: ["context.source.runtime"], tools: [], prompts: [], events: [] },
});
