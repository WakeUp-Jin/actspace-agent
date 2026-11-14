import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "桌面接线",
    description: "桌面端的会话与界面接口",
    scope: "global",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.desktop-app",
  version: "0.1.0",
  name: "ActSpace Desktop Application",
  entry: { entryId: "desktop.app", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["session.runtime", "agent.runtime", "llm.service"],
  contributions: { services: ["desktop.app"], tools: [], prompts: [], events: [] },
});
