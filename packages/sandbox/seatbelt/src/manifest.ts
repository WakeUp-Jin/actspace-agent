import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const SANDBOX_SEATBELT_PLUGIN_ID = "actspace.sandbox-seatbelt" as const;

export const manifest = defineBuiltinPluginManifest({
  pluginId: SANDBOX_SEATBELT_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Sandbox Seatbelt Backend",
  entry: { entryId: "sandbox-seatbelt", behavior: "./plugin.js" },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["sandbox", "actspace.host.sandbox"],
  contributions: { services: [], tools: [], prompts: [], events: [] },
});
