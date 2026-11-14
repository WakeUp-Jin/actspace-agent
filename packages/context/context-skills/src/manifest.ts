import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "Skill 目录",
    description: "告诉 Agent 有哪些 Skill 可用",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.context-skills",
  version: "0.1.0",
  name: "ActSpace Context skills",
  entry: { entryId: "context.skills", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["context.assembly"],
  contributions: { services: ["context.source.skills"], tools: [], prompts: [], events: [] },
});
