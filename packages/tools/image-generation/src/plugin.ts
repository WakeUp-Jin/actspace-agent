import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext, ToolDefinition, ToolRuntime, ToolPermissionContract } from "@actspace/tools-runtime";
import type { CordisContext } from "@actspace/cordis-adapter";
import { IMAGE_GENERATION_PLUGIN_ID, IMAGE_GENERATION_TOOLS } from "./manifest.js";

export type ToolName = (typeof IMAGE_GENERATION_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly dispose?: () => Promise<void> };
export const IMAGE_GENERATION_HOST_PORT_ID = "actspace.host.tools.image-generation" as const;
export type HostPort = { readonly createPorts: () => ToolPorts | Promise<ToolPorts> };
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntime["register"]> };

export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const host = ctx.get?.(IMAGE_GENERATION_HOST_PORT_ID) as HostPort | undefined;
  if (!runtime || !host) throw new Error("image-generation requires tools.runtime and actspace.host.tools.image-generation.");
  const ports = await host.createPorts();
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports); }
  catch (error) { await ports.dispose?.(); throw error; }
  ctx.provide?.("tools.image-generation", Object.freeze({ registrations, definitions: TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "image-generation cleanup failed.");
  }, "image-generation");
}
export function registerTools(runtime: ToolRuntime, ports: ToolPorts): readonly ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  try {
    for (const item of TOOL_DEFINITIONS) {
      const handler = ports[item.localName] ?? (async () => ({ status: "failed" as const, modelOutput: [{ type: "text" as const, text: `${item.localName} Host capability is unavailable.` }], summary: `${item.localName} unavailable`, failure: { code: "CAPABILITY_UNAVAILABLE", message: `${item.localName} Host capability is unavailable.`, retryable: false } }));
      registrations.push(Object.freeze({ name: item.definition.name, localName: item.localName, handle: runtime.register({ definition: item.definition, executor: { concurrencySafe: item.definition.concurrency !== "exclusive", execute: handler }, permission: permissionContract(item.localName) }) }));
    }
    return Object.freeze(registrations);
  } catch (error) {
    for (const item of registrations.reverse()) item.handle.beginDrain();
    throw error;
  }
}

function permissionContract(name: ToolName): ToolPermissionContract {
  return { extractResources: () => [], evaluate: () => ({ kind: "allow" as const }) };
}
type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
const IMAGE = ["network", "filesystem.write"] as const;
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  definition("generate_image", "Generate images from a detailed prompt using the configured image service.", IMAGE, "exclusive", objectSchema({ prompt: stringSchema("Detailed image description."), size: { type: "string", enum: ["1024x1024", "1536x1024", "1024x1536"], default: "1024x1024" }, n: { type: "integer", minimum: 1, maximum: 10, default: 1 } }, ["prompt"]), ["/prompt"]),
]);
export function activate() { return { services: { "tools.image-generation": Object.freeze({ registerTools, TOOL_DEFINITIONS }) }, dispose: () => undefined }; }
function definition(localName: ToolName, description: string, capabilities: readonly string[], concurrency: ToolDefinition["concurrency"], inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = []): DefinitionEntry {
  return Object.freeze({ localName, definition: Object.freeze({ abiVersion: 2, pluginId: IMAGE_GENERATION_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: capabilities.map((capabilityId) => ({ capabilityId, mode: capabilityId === "filesystem.write" ? "write" as const : capabilityId === "process" ? "execute" as const : "use" as const, resourceScope: "workspace" })), concurrency, sensitiveArgumentPaths, resultSchemaVersion: 1 }) });
}
function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function stringSchema(description: string) { return Object.freeze({ type: "string", description, minLength: 1 }); }
function integerSchema(description: string, minimum: number) { return Object.freeze({ type: "integer", description, minimum }); }
