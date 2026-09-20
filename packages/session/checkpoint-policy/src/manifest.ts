import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.session.checkpoint-policy",
  version: "0.1.0",
  name: "ActSpace Session Checkpoint Policy",
  entry: { entryId: "session.checkpoint-policy", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["session.runtime"],
  contributions: { services: [], tools: [], prompts: [], events: ["session/checkpoint"] },
});
