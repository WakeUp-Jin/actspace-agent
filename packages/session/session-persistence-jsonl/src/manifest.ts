import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "会话文件存储",
    description: "把会话保存为本机的 JSONL 文件",
    scope: "global",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.session.jsonl",
  version: "0.1.0",
  name: "ActSpace Session JSONL",
  entry: { entryId: "session.jsonl", behavior: "./plugin.js" },
  host: { required: ["filesystem.session"], optional: [] },
  frontend: null,
  injects: ["actspace.host.session", "session.journal"],
  contributions: { services: ["session.storage"], tools: [], prompts: [], events: [] },
});
