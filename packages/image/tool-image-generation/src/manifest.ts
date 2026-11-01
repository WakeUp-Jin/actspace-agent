import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const IMAGE_GENERATION_PLUGIN_ID = "actspace.image-generation" as const;
export const IMAGE_GENERATION_TOOLS = Object.freeze(["generate_image"] as const);
export const manifest = defineBuiltinPluginManifest({
  pluginId: IMAGE_GENERATION_PLUGIN_ID, version: "2.0.0", name: "ActSpace Image Generation",
  entry: { entryId: "tools.image-generation", behavior: "./plugin.js" },
  host: { required: ["network", "filesystem.write"], optional: [] }, frontend: null,
  injects: ["tools.runtime", "actspace.host.tools.image-generation"],
  contributions: { services: ["tools.image-generation"], tools: IMAGE_GENERATION_TOOLS, prompts: [], events: [] },
});
