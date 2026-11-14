import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "上下文披露",
    description: "按需把工作区路径和文件摘要告诉 Agent",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.context-disclosure",
  version: "0.1.0",
  name: "ActSpace Context Disclosure",
  entry: { entryId: "context.disclosure", behavior: "./plugin.js" },
  host: { required: ["actspace.host.agent"], optional: [] },
  frontend: null,
  injects: ["context.engine", "context.assembly", "actspace.host.agent"],
  contributions: { services: ["context.disclosure"], tools: [], prompts: [], events: [] },
});
