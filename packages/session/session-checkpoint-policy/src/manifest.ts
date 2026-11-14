import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "检查点",
    description: "决定什么时候给会话存检查点",
    scope: "global",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.session.checkpoint-policy",
  version: "0.1.0",
  name: "ActSpace Session Checkpoint Policy",
  entry: { entryId: "session.checkpoint-policy", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["session.runtime"],
  contributions: { services: ["session.checkpoint"], tools: [], prompts: [], events: [] },
});
