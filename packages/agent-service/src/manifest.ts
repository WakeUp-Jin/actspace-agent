import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
import { TASK_EVENT, RUN_EVENT, QUEUE_EVENT } from "./task-events.js";
export const manifest = defineBuiltinPluginManifest({
  pluginId: "actspace.agent-service", version: "0.1.0", name: "Agent application service",
  entry: { entryId: "agent-service", behavior: "./plugin.js", codec: "./codec.js" },
  host: { required: [], optional: [] }, frontend: null,
  injects: ["actspace.host.agent-service"],
  contributions: { services: ["agent.service"], tools: [], prompts: [], events: [TASK_EVENT, RUN_EVENT, QUEUE_EVENT] },
});
