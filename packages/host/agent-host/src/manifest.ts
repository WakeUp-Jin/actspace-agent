import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.agent-host", version: "0.1.0", name: "ActSpace Agent Host",
  entry: { entryId: "host.application", behavior: "./plugin.js" },
  host: { required: [], optional: [] }, frontend: null,
  injects: ["session.runtime", "agent.runtime"],
  contributions: { services: ["host.application"], tools: [], prompts: [], events: [] },
});
