import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const FILESYSTEM_READ_PLUGIN_ID = "actspace.filesystem-read" as const;
/** present accepts at most this many files per call. */
export const PRESENT_MAX_FILES = 4;
export const FILESYSTEM_READ_TOOLS = Object.freeze(["read_file", "list_directory", "present"] as const);
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "读文件",
    description: "读取工作区里的文件",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: FILESYSTEM_READ_PLUGIN_ID,
  version: "2.0.0",
  name: "ActSpace Filesystem Read",
  entry: { entryId: "tools.filesystem-read", behavior: "./plugin.js" },
  host: { required: ["filesystem.read"], optional: [] },
  frontend: null,
  injects: ["tools.runtime"],
  // Without the grant the tools register but report the capability as unavailable.
  optionalInjects: ["actspace.host.filesystem"],
  contributions: { services: ["tools.filesystem-read"], tools: FILESYSTEM_READ_TOOLS, prompts: [], events: [] },
});
