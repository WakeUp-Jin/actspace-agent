import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.headless",
  version: "0.1.0",
  name: "ActSpace Headless Runner",
  entry: { entryId: "headless.runner", behavior: "./plugin.js" },
  host: { required: [], optional: ["headless"] },
  frontend: null,
  injects: ["actspace.host.headless", "session.runtime", "agent.loop"],
  contributions: { services: ["headless.runner"], tools: [], prompts: [], events: ["headless/started", "headless/completed", "headless/failed"] },
});
