import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "审批",
    description: "危险操作前先征求你的同意",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.tools.approval",
  version: "0.1.0",
  name: "ActSpace Tool Approval",
  entry: { entryId: "tools.approval", behavior: "./plugin.js" },
  host: { required: ["approval"], optional: [] },
  frontend: null,
  contributions: { services: ["tools.approval"], tools: [], prompts: [], events: [] },
});
