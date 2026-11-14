import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "自动审批",
    description: "用模型判断低风险操作能否直接放行",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.auto-review",
  version: "0.1.0",
  name: "Auto review",
  entry: { entryId: "approval.auto-review", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["llm.service", "llm.auxiliary-requests"],
  contributions: { services: ["approval.auto-review"], tools: [], prompts: [], events: [] },
});
