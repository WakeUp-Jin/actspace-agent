import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const SANDBOX_NONO_PLUGIN_ID = "actspace.sandbox-nono" as const;

export const manifest = defineBuiltinPluginManifest({
  pluginId: SANDBOX_NONO_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Sandbox nono Backend",
  entry: { entryId: "sandbox-nono", behavior: "./plugin.js" },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["sandbox", "actspace.host.sandbox"],
  contributions: { services: [], tools: [], prompts: [], events: [] },
});
