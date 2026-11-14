import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "作用域",
    description: "为 Agent 提供生命周期与资源作用域",
    scope: "global",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.core.scope",
  version: "0.1.0",
  name: "ActSpace Core Scope",
  entry: { entryId: "core.scope", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  contributions: { services: ["core.scope"], tools: [], prompts: [], events: [] },
});
