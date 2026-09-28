import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const WEB_TOOLS_PLUGIN_ID = "actspace.web-tools" as const;
export const WEB_TOOLS_TOOLS = Object.freeze(["web", "web_search", "web_fetch"] as const);
export const manifest = defineBuiltinPluginManifest({
  pluginId: WEB_TOOLS_PLUGIN_ID, version: "2.0.0", name: "ActSpace Web Tools",
  entry: { entryId: "tools.web-tools", behavior: "./plugin.js" },
  host: { required: ["network"], optional: [] }, frontend: null,
  injects: ["tools.runtime", "actspace.host.tools.web-tools"],
  contributions: { services: ["tools.web-tools"], tools: WEB_TOOLS_TOOLS, prompts: [], events: [] },
});
