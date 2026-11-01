import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const SANDBOX_SEATBELT_PLUGIN_ID = "actspace.sandbox-seatbelt" as const;

export const manifest = defineBuiltinPluginManifest({
  display: { title: "沙箱：Seatbelt", description: "macOS 上的沙箱实现", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: SANDBOX_SEATBELT_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Sandbox Seatbelt Backend",
  entry: { entryId: "sandbox-seatbelt", behavior: "./plugin.js" },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["sandbox", "actspace.host.sandbox"],
  contributions: { services: [], tools: [], prompts: [], events: [] },
});
