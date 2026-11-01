import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const FILESYSTEM_SEARCH_PLUGIN_ID = "actspace.filesystem-search" as const;
export const FILESYSTEM_SEARCH_TOOLS = Object.freeze(["grep", "glob"] as const);
export const manifest = defineBuiltinPluginManifest({
  pluginId: FILESYSTEM_SEARCH_PLUGIN_ID, version: "2.0.0", name: "ActSpace Filesystem Search",
  entry: { entryId: "tools.filesystem-search", behavior: "./plugin.js" },
  host: { required: ["filesystem.read"], optional: [] }, frontend: null,
  injects: ["tools.runtime", "actspace.host.tools.filesystem-search"],
  contributions: { services: ["tools.filesystem-search"], tools: FILESYSTEM_SEARCH_TOOLS, prompts: [], events: [] },
});
