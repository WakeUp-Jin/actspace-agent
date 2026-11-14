import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "远程连接",
    description: "让手机和网页连接这台电脑上的 Agent",
    scope: "global",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.agent-host",
  version: "0.1.0",
  name: "ActSpace Agent Host",
  entry: { entryId: "host.application", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["session.runtime", "agent.runtime"],
  contributions: { services: ["host.application"], tools: [], prompts: [], events: [] },
});
