import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const DOCUMENT_PLUGIN_ID = "actspace.document" as const;
export const DOCUMENT_TOOLS = Object.freeze(["read_document"] as const);
export const DOCUMENT_HOST_PORT_ID = "actspace.host.tools.document" as const;
export const manifest = defineBuiltinPluginManifest({
  display: { title: "读文档", description: "读取 PDF、Word 和 PPT 里的文字", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: DOCUMENT_PLUGIN_ID, version: "2.0.0", name: "ActSpace Document",
  entry: { entryId: "tools.document", behavior: "./plugin.js", required: false },
  host: { required: ["network", "filesystem.read"], optional: [] }, frontend: null,
  injects: ["tools.runtime"],
  // Without the Host port the tool is not registered; with it, the port's `available()` decides visibility.
  optionalInjects: [DOCUMENT_HOST_PORT_ID],
  contributions: { services: ["tools.document"], tools: DOCUMENT_TOOLS, prompts: [], events: [] },
});
