import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.english-learning", version: "0.1.0", name: "英语辅助学习",
  entry: { entryId: "english-learning", behavior: "./plugin.js", required: false },
  host: { required: ["renderer", "network", "credential", "process"], optional: [] }, frontend: null,
  injects: ["agent.registry", "session.runtime"],
  contributions: { services: ["english-learning"], prompts: ["english-learning/v1"], tools: [], events: [] },
});
