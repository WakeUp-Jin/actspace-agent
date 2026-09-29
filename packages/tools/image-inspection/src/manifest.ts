import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const IMAGE_INSPECTION_PLUGIN_ID = "actspace.image-inspection" as const;
export const IMAGE_INSPECTION_TOOLS = Object.freeze(["inspect_image"] as const);
export const manifest = defineBuiltinPluginManifest({
  pluginId: IMAGE_INSPECTION_PLUGIN_ID, version: "2.0.0", name: "ActSpace Image Inspection",
  entry: { entryId: "tools.image-inspection", behavior: "./plugin.js" },
  host: { required: ["network"], optional: [] }, frontend: null,
  injects: ["llm.service", "tools.runtime", "actspace.host.tools.image-inspection"],
  contributions: { services: ["tools.image-inspection"], tools: IMAGE_INSPECTION_TOOLS, prompts: [], events: [] },
});
