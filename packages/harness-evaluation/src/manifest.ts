import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const HARNESS_EVALUATION_PLUGIN_ID = "actspace.harness-evaluation" as const;

export const manifest = defineBuiltinPluginManifest({
  pluginId: HARNESS_EVALUATION_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Harness Evaluation",
  entry: { entryId: "harness-evaluation", behavior: "./plugin.js" },
  host: { required: ["process", "filesystem.write"], optional: [] },
  frontend: null,
  injects: ["sandbox"],
  // Without the Host port the service still loads and reports itself unavailable.
  optionalInjects: ["actspace.host.harness-evaluation"],
  contributions: { services: ["harness.evaluation"], tools: [], prompts: [], events: [] },
});
