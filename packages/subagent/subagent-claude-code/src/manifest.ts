import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";
import { DEFAULT_CLAUDE_CODE_CONFIG } from "./backend.js";

export const CLAUDE_CODE_SUBAGENT_PLUGIN_ID = "actspace.subagent-claude-code" as const;
export const CLAUDE_CODE_SUBAGENT_TOOL_NAMES = Object.freeze(["agent_claude_code"] as const);

export const manifest = defineBuiltinPluginManifest({
  display: {
    title: "Claude Code",
    description: "用本机 Claude Code 跑子任务，用它自己的权限，不经审批和沙箱",
    scope: "session",
    defaultEnabled: false,
    canDisable: true,
  },
  pluginId: CLAUDE_CODE_SUBAGENT_PLUGIN_ID,
  version: "0.1.0",
  name: "ActSpace Claude Code Subagent",
  entry: { entryId: "subagent.claude-code", behavior: "./plugin.js", required: false },
  config: { ...DEFAULT_CLAUDE_CODE_CONFIG },
  host: { required: ["process"], optional: [] },
  frontend: null,
  injects: ["tools.runtime", "agent.registry", "actspace.host.subagents"],
  contributions: {
    services: ["tools.subagent-claude-code"],
    tools: [...CLAUDE_CODE_SUBAGENT_TOOL_NAMES],
    prompts: [],
    events: [],
  },
});
