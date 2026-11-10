import { defineBuiltinPluginManifest } from "@actspace/cordis-adapter";

export const CONTEXT_ASSEMBLY_SERVICE_ID = "context.assembly" as const;
/** Source kinds every agent must receive; a Harness that drops one of their plugins fails at the first agent, not silently. */
export const DEFAULT_REQUIRED_CONTEXT_KINDS: readonly string[] = Object.freeze(["system", "conversation"]);

export const manifest = defineBuiltinPluginManifest({
  display: { title: "上下文装配", description: "登记每个上下文来源，按 Agent 角色拼出每轮请求的上下文", scope: "session", defaultEnabled: true, canDisable: false },
  pluginId: "actspace.context-assembly",
  version: "0.1.0",
  name: "ActSpace Context Assembly",
  entry: { entryId: "context.assembly", behavior: "./plugin.js" },
  config: { required: [...DEFAULT_REQUIRED_CONTEXT_KINDS] },
  host: { required: [], optional: [] },
  frontend: null,
  injects: [],
  contributions: { services: [CONTEXT_ASSEMBLY_SERVICE_ID], tools: [], prompts: [], events: [] },
});
