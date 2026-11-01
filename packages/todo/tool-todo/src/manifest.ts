import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const TODO_PLUGIN_ID = "actspace.todo" as const;
export const TODO_PROJECTION_PLUGIN_ID = "actspace.todo-projection" as const;
export const TODO_EVENT_TYPE = "plugin/actspace.todo/todo-write" as const;

/** Todo tools: a session plugin loaded in every Harness. */
export const manifest = defineBuiltinPluginManifest({
  display: { title: "待办", description: "拆分任务并跟踪进度", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: TODO_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Todo Tools",
  entry: { entryId: "tools.todo", behavior: "./plugin.js", codec: "./codec.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "session.runtime"],
  contributions: { services: ["tools.todo"], tools: ["todo_read", "todo_write"], prompts: [], events: [TODO_EVENT_TYPE] },
});

/** Todo view: a global plugin that registers the history projection once on the Host. */
export const projectionManifest = defineBuiltinPluginManifest({
  display: { title: "待办视图", description: "把 Agent 的待办整理给界面显示", scope: "global", defaultEnabled: true, canDisable: false },
  pluginId: TODO_PROJECTION_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Todo Projection",
  entry: { entryId: "todo-projection", behavior: "./projection-plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["session.projection"],
  contributions: { services: [], tools: [], prompts: [], events: [] },
});
