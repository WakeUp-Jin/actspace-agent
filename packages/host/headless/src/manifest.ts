import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const manifest = defineBuiltinPluginManifest({
  display: { title: "命令行运行", description: "在命令行和脚本里运行 Agent", scope: "global", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.headless",
  version: "0.1.0",
  name: "ActSpace Headless Runner",
  entry: { entryId: "headless.runner", behavior: "./plugin.js" },
  host: { required: [], optional: ["headless"] },
  frontend: null,
  injects: ["actspace.host.headless", "session.runtime", "agent.runtime"],
  contributions: { services: ["headless.runner"], tools: [], prompts: [], events: ["headless/started", "headless/completed", "headless/failed"] },
});
