import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const SANDBOX_PLUGIN_ID = "actspace.sandbox" as const;

export const manifest = defineBuiltinPluginManifest({
  pluginId: SANDBOX_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Sandbox",
  entry: { entryId: "sandbox", behavior: "./plugin.js" },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["actspace.host.sandbox"],
  contributions: { services: ["sandbox"], tools: [], prompts: [], events: [] },
});
