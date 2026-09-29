import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const SHELL_TOOLS_PLUGIN_ID = "actspace.shell-tools" as const;
export const SHELL_TOOLS_TOOLS = Object.freeze(["bash", "bash_output", "bash_kill"] as const);
export const manifest = defineBuiltinPluginManifest({
  pluginId: SHELL_TOOLS_PLUGIN_ID, version: "2.0.0", name: "ActSpace Shell Tools",
  entry: { entryId: "tools.shell-tools", behavior: "./plugin.js" },
  host: { required: ["process"], optional: [] }, frontend: null,
  injects: ["tools.runtime", "actspace.host.tools.shell-tools"],
  contributions: { services: ["tools.shell-tools"], tools: SHELL_TOOLS_TOOLS, prompts: [], events: [] },
});
