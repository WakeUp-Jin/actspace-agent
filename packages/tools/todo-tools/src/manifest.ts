import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const TODO_PLUGIN_ID = "actspace.todo" as const;
export const TODO_EVENT_TYPE = "plugin/actspace.todo/todo-write" as const;

export const manifest = defineBuiltinPluginManifest({
  pluginId: TODO_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Todo Tools",
  entry: { entryId: "tools.todo", behavior: "./plugin.js", codec: "./codec.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "session.runtime", "session.projection"],
  contributions: { services: ["tools.todo"], tools: ["todo_read", "todo_write"], prompts: [], events: [TODO_EVENT_TYPE] },
});
