import { ACTSPACE_SERVICE_IDS, getService, serviceView, type CordisContext } from "@actspace/cordis-adapter";
import { TOOL_RUNTIME_SERVICE, type ToolRuntimeContract, type ToolExecutionContext } from "@actspace/tool-runtime";
export type PluginManagerPort = { inspect(context: ToolExecutionContext): Promise<unknown>; execute(args: Readonly<Record<string, unknown>>, context: ToolExecutionContext): Promise<unknown> };
/** 这个包用到的 Agent Host 端口：Host 给了 `evolution` 才能开发插件。 */
export const PLUGIN_MANAGER_HOST_VIEW = serviceView<{ readonly evolution?: PluginManagerPort }>(ACTSPACE_SERVICE_IDS.hostAgent);
export const inject = ["tools.runtime", "actspace.host.agent"];
/** A per-generation proxy; durable management lives in the stable Host. */
export function apply(ctx: CordisContext): void {
  const tools = getService(ctx, TOOL_RUNTIME_SERVICE);
  const evolution = getService(ctx, PLUGIN_MANAGER_HOST_VIEW)?.evolution;
  if (!tools) throw new Error("Plugin Manager requires tools.runtime");
  const handles: ReturnType<ToolRuntimeContract["register"]>[] = [];
  try { for (const name of ["harness_inspect", "plugin_manager"]) handles.push(tools.register({
    definition: { abiVersion: 2, pluginId: "actspace.plugin-manager", name, definitionVersion: 1,
      description: name === "harness_inspect" ? "Inspect the current Run Harness, selected session version, editable plugins, tools and official development contract. Read-only." : "Develop a session-local tool ONLY on explicit user request. Read actspace-plugin-development first. Actions: create (purpose, toolName or entryId), build/prepare/apply/status/discard (workspaceId), rollback (workspaceId, executionDigest). Changes apply to the next user message, never this Run. Preparation executes trusted code and activation requires Host approval.",
      inputSchema: name === "harness_inspect" ? { type: "object", properties: {}, additionalProperties: false } : { type: "object", properties: { action: { type: "string", enum: ["create", "build", "prepare", "apply", "status", "discard", "rollback"] }, purpose: { type: "string" }, toolName: { type: "string" }, entryId: { type: "string" }, workspaceId: { type: "string" }, executionDigest: { type: "string" } }, required: ["action"], additionalProperties: false },
      effects: name === "harness_inspect" ? [] : [{ capabilityId: "process", mode: "execute", resourceScope: "workspace" }], modes: ["agent"], concurrency: "exclusive", sensitiveArgumentPaths: [], resultSchemaVersion: 1 },
    executor: { execute: async (args, context) => {
      if (!evolution) throw new Error("Harness evolution is unavailable on this Host");
      try {
        const value = name === "harness_inspect" ? { ...(await evolution.inspect(context) as object), tools: tools.registry.listDefinitions() } : await evolution.execute(args, context);
        return { status: "completed", summary: name, modelOutput: [{ type: "json", value: JSON.parse(JSON.stringify(value)) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code: "EVOLUTION_FAILED", message, retryable: false } };
      }
    } },
    permission: { extractResources: () => [], evaluate: () => ({ kind: "allow" }) },
  })); } catch (error) { for (const handle of handles) { handle.beginDrain(); void handle.dispose(); } throw error; }
  ctx.provide?.("tools.plugin-manager", { definitions: handles.map(h => h.registration.definition) });
  ctx.effect?.(() => async () => { for (const handle of handles) handle.beginDrain(); await Promise.all(handles.map(h => h.dispose())); }, "tools.plugin-manager");
}
