import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const FILESYSTEM_WRITE_PLUGIN_ID = "actspace.filesystem-write" as const;
export const FILESYSTEM_WRITE_TOOLS = Object.freeze(["edit_file", "write_file", "delete_file"] as const);
export const manifest = defineBuiltinPluginManifest({
  pluginId: FILESYSTEM_WRITE_PLUGIN_ID, version: "2.0.0", name: "ActSpace Filesystem Write",
  entry: { entryId: "tools.filesystem-write", behavior: "./plugin.js" },
  host: { required: ["filesystem.write"], optional: [] }, frontend: null,
  injects: ["tools.runtime", "actspace.host.tools.filesystem-write"],
  contributions: { services: ["tools.filesystem-write"], tools: FILESYSTEM_WRITE_TOOLS, prompts: [], events: [] },
});
