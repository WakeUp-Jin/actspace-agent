import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.side-chat", version: "0.1.0", name: "侧边对话",
  entry: { entryId: "side-chat", behavior: "./plugin.js", required: false },
  host: { required: [], optional: [] }, frontend: null,
  injects: ["session.runtime"],
  contributions: { services: ["side-chat"], prompts: ["side-chat/v1"], tools: [], events: [] },
});
