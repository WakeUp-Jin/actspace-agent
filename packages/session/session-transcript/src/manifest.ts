import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
export const manifest = defineBuiltinPluginManifest({
  display: { title: "会话记录", description: "每轮结束把对话写成 Markdown，供 Agent 读取历史会话", scope: "global", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.session-transcript", version: "0.1.0", name: "会话记录 Markdown",
  entry: { entryId: "session-transcript", behavior: "./plugin.js", required: false },
  host: { required: ["filesystem.session"], optional: [] }, frontend: null,
  injects: ["actspace.host.session", "session.runtime", "session.storage"],
  contributions: { services: ["session.transcript"], prompts: ["session-transcript/v1"], tools: [], events: [] },
});
