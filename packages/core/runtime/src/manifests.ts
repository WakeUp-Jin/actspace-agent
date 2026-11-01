import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

/**
 * Manifests for the plugins that live inside @actspace/runtime itself.
 * Entry ids, `injects` and `provides` mirror the previously hand-written loader and Harness tables.
 */

export const runtimeManifest = defineBuiltinPluginManifest({
  display: { title: "运行时底座", description: "启动 ActSpace、装配插件、管理生命周期", scope: "global", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.runtime",
  version: "0.1.0",
  name: "ActSpace Runtime",
  entry: { entryId: "actspace-runtime", behavior: "./cordis.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["actspace.host"],
  contributions: { services: ["actspace.runtime"], tools: [], prompts: [], events: [] },
});

export const sessionRuntimeManifest = defineBuiltinPluginManifest({
  display: { title: "会话运行时", description: "新建、恢复和归档会话", scope: "global", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.session-runtime",
  version: "0.1.0",
  name: "ActSpace Session Runtime",
  entry: { entryId: "session-runtime", behavior: "./session/session-plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["actspace.host.session", "session.journal", "session.store", "session.projection"],
  contributions: { services: ["session.runtime", "llm.auxiliary-requests"], tools: [], prompts: [], events: [] },
});

export const agentRuntimeManifest = defineBuiltinPluginManifest({
  display: { title: "Agent 运行时", description: "为每个会话挂载 Harness 并运行", scope: "global", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.agent-runtime",
  version: "0.1.0",
  name: "ActSpace Agent Runtime",
  entry: { entryId: "agent-runtime", behavior: "./harness/agent-runtime-plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["actspace.host.llm", "actspace.host.prompt", "actspace.host.agent", "actspace.host.subagents", "actspace.host.background-tasks", "actspace.host.sandbox", "agent.registry", "session.runtime", "llm.auxiliary-requests", "session.checkpoint", "session.journal", "session.projection", "actspace.host.tools.filesystem-read", "actspace.host.tools.filesystem-search", "actspace.host.tools.filesystem-write", "actspace.host.tools.shell-tools", "actspace.host.tools.web-tools", "actspace.host.tools.image-generation", "actspace.host.tools.image-inspection", "actspace.host.session"],
  contributions: { services: ["agent.runtime", "agent.service", "harness.control", "harness.hmr", "harness.plugin-manager"], tools: [], prompts: [], events: [] },
});

/** The per-session Agent loop. Lives in the runtime package but is loaded into every Harness. */
export const agentFactoryManifest = defineBuiltinPluginManifest({
  display: { title: "Agent 循环", description: "每一轮调用模型和工具的主循环", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.agent-factory",
  version: "0.1.0",
  name: "ActSpace Agent Factory",
  entry: { entryId: "agent-factory", behavior: "./harness/agent-factory-plugin.js" },
  host: { required: [], optional: [] },
  frontend: null,
  injects: ["actspace.host.agent", "agent.registry", "session.runtime", "session.checkpoint", "llm.service", "tools.runtime", "prompt.runtime", "context.engine", "context.source.system", "context.source.conversation"],
  contributions: { services: ["actspace.agent.factory", "agent.run-factory"], tools: [], prompts: [], events: [] },
});
