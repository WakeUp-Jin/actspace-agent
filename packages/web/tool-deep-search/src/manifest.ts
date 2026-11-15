import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const DEEP_SEARCH_PLUGIN_ID = "actspace.deep-search" as const;
export const DEEP_SEARCH_TOOLS = Object.freeze(["deep_search"] as const);
export const DEEP_SEARCH_HOST_PORT_ID = "actspace.host.tools.deep-search" as const;
export const manifest = defineBuiltinPluginManifest({
  display: { title: "深度搜索", description: "多轮搜索网页，给出带出处的结论", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: DEEP_SEARCH_PLUGIN_ID, version: "2.0.0", name: "ActSpace Deep Search",
  entry: { entryId: "tools.deep-search", behavior: "./plugin.js", required: false },
  host: { required: ["network"], optional: [] }, frontend: null,
  injects: ["tools.runtime"],
  // Without the Host port the tool is not registered; with it, the port's `available()` decides visibility.
  optionalInjects: [DEEP_SEARCH_HOST_PORT_ID],
  contributions: { services: ["tools.deep-search"], tools: DEEP_SEARCH_TOOLS, prompts: [], events: [] },
});
