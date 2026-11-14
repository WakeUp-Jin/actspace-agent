import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "对话历史",
    description: "把之前的对话放进上下文",
    scope: "session",
    defaultEnabled: true,
    canDisable: false,
  },
  pluginId: "actspace.context-conversation",
  version: "0.1.0",
  name: "ActSpace Context Conversation",
  entry: { entryId: "context.conversation", behavior: "./plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["context.assembly"],
  contributions: { services: ["context.source.conversation"], tools: [], prompts: [], events: [] },
});
