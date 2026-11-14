import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const IMAGE_INSPECTION_PLUGIN_ID = "actspace.image-inspection" as const;
export const IMAGE_INSPECTION_TOOLS = Object.freeze(["inspect_image"] as const);
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "看图片",
    description: "让 Agent 看懂图片内容",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: IMAGE_INSPECTION_PLUGIN_ID,
  version: "2.0.0",
  name: "ActSpace Image Inspection",
  entry: { entryId: "tools.image-inspection", behavior: "./plugin.js" },
  host: { required: ["network"], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "llm.service", "llm.auxiliary-requests", "actspace.host.tools.image-inspection"],
  contributions: { services: ["tools.image-inspection"], tools: IMAGE_INSPECTION_TOOLS, prompts: [], events: [] },
});
