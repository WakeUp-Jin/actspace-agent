import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.desktop-app",
  version: "0.1.0",
  name: "ActSpace Desktop Application",
  entry: { entryId: "desktop.app", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["session.runtime", "agent.runtime", "llm.service", "compaction.runtime"],
  contributions: { services: ["desktop.app"], tools: [], prompts: [], events: [] },
});
