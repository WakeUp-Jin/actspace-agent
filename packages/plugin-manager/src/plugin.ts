import type { CordisContext } from "@actspace/cordis-adapter";
import type { ToolRuntime, ToolExecutionContext } from "@actspace/tools-runtime";
export type PluginManagerPort = { inspect(context: ToolExecutionContext): Promise<unknown>; execute(args: Readonly<Record<string, unknown>>, context: ToolExecutionContext): Promise<unknown> };
export const inject = ["tools.runtime", "actspace.host.agent"];
/** A per-generation proxy; durable management lives in the stable Host. */
export function apply(ctx: CordisContext): void {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime;
  const host = ctx.get?.("actspace.host.agent") as { evolution?: PluginManagerPort };
  if (!tools) throw new Error("Plugin Manager requires tools.runtime");
  const handles: ReturnType<ToolRuntime["register"]>[] = [];
  try { for (const name of ["harness_inspect", "plugin_manager"]) handles.push(tools.register({
    definition: { abiVersion: 2, pluginId: "actspace.plugin-manager", name, definitionVersion: 1,
      description: name === "harness_inspect" ? "Inspect the current Run Harness, selected session version, editable plugins, tools and official development contract. Read-only." : "Develop a session-local tool ONLY on explicit user request. Read actspace-plugin-development first. Actions: create (purpose, toolName or entryId), build/prepare/apply/status/discard (workspaceId), rollback (workspaceId, executionDigest). Changes apply to the next user message, never this Run. Preparation executes trusted code and activation requires Host approval.",
      inputSchema: name === "harness_inspect" ? { type: "object", properties: {}, additionalProperties: false } : { type: "object", properties: { action: { type: "string", enum: ["create", "build", "prepare", "apply", "status", "discard", "rollback"] }, purpose: { type: "string" }, toolName: { type: "string" }, entryId: { type: "string" }, workspaceId: { type: "string" }, executionDigest: { type: "string" } }, required: ["action"], additionalProperties: false },
      effects: name === "harness_inspect" ? [] : [{ capabilityId: "process", mode: "execute", resourceScope: "workspace" }], concurrency: "exclusive", sensitiveArgumentPaths: [], resultSchemaVersion: 1 },
    executor: { execute: async (args, context) => {
      if (!host.evolution) throw new Error("Harness evolution is unavailable on this Host");
      try {
        const value = name === "harness_inspect" ? { ...(await host.evolution.inspect(context) as object), tools: tools.registry.listDefinitions() } : await host.evolution.execute(args, context);
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
