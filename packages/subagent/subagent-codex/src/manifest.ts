import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
import { DEFAULT_CODEX_CONFIG } from "./backend.js";

export const CODEX_SUBAGENT_PLUGIN_ID = "actspace.subagent-codex" as const;
export const CODEX_SUBAGENT_TOOL_NAMES = Object.freeze(["agent_codex"] as const);

export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "Codex 子智能体",
    description: "用本机 Codex 跑子任务，用它自己的权限，不经审批和沙箱",
    scope: "session",
    defaultEnabled: false,
    canDisable: true,
  },
  pluginId: CODEX_SUBAGENT_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Codex Subagent",
  entry: { entryId: "subagent.codex", behavior: "./plugin.js", required: false },
  config: { ...DEFAULT_CODEX_CONFIG },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "agent.registry", "actspace.host.subagents"],
  contributions: { services: ["tools.subagent-codex"], tools: [...CODEX_SUBAGENT_TOOL_NAMES], prompts: [], events: [] },
});
