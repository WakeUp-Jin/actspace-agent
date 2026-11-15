import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { TOOL_RUNTIME_SERVICE, type ToolBodyResult, type ToolExecutionContext, type ToolDefinition, type ToolRuntimeContract, type ToolPermissionContract } from "@actspace/tool-runtime";
import { getService, serviceKey, type CordisContext } from "@actspace/cordis-adapter";
import { DEEP_SEARCH_HOST_PORT_ID, DEEP_SEARCH_PLUGIN_ID, type DEEP_SEARCH_TOOLS } from "./manifest.js";

export { DEEP_SEARCH_HOST_PORT_ID } from "./manifest.js";
export type ToolName = (typeof DEEP_SEARCH_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly dispose?: () => Promise<void> };
/** `createPorts()` builds the network implementation once per Harness; `available()` is the O(1) visibility predicate. */
export type HostPort = { readonly createPorts: () => ToolPorts | Promise<ToolPorts>; readonly available: () => boolean };
export const DEEP_SEARCH_HOST_PORT = serviceKey<HostPort>(DEEP_SEARCH_HOST_PORT_ID);
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntimeContract["register"]> };

/**
 * The Host owns the DeepSeek key and switch, so the implementation comes through the Host port. Without the port the
 * tool is not registered; the service is still provided and marked unavailable.
 */
export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = getService(ctx, TOOL_RUNTIME_SERVICE);
  if (!runtime) throw new Error("deep-search requires tools.runtime.");
  const host = getService(ctx, DEEP_SEARCH_HOST_PORT);
  if (!host) {
    ctx.provide?.("tools.deep-search", Object.freeze({ available: false, registrations: Object.freeze([]), definitions: TOOL_DEFINITIONS }));
    return;
  }
  const ports = await host.createPorts();
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports, () => host.available()); }
  catch (error) { await ports.dispose?.(); throw error; }
  ctx.provide?.("tools.deep-search", Object.freeze({ available: true, registrations, definitions: TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "deep-search cleanup failed.");
  }, "deep-search");
}

export function registerTools(runtime: ToolRuntimeContract, ports: ToolPorts, visible?: () => boolean): readonly ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  try {
    for (const item of TOOL_DEFINITIONS) {
      const handler = ports[item.localName] ?? unavailable(item.localName);
      registrations.push(Object.freeze({ name: item.definition.name, localName: item.localName, handle: runtime.register({ definition: item.definition, executor: { concurrencySafe: item.definition.concurrency !== "exclusive", execute: handler }, permission: permissionContract(), ...(visible === undefined ? {} : { visible }) }) }));
    }
    return Object.freeze(registrations);
  } catch (error) {
    for (const item of registrations.reverse()) item.handle.beginDrain();
    throw error;
  }
}

function unavailable(localName: ToolName): ToolHandler {
  const message = `${localName} Host capability is unavailable.`;
  return async () => ({ status: "failed" as const, modelOutput: [{ type: "text" as const, text: message }], summary: `${localName} unavailable`, failure: { code: "CAPABILITY_UNAVAILABLE", message, retryable: false } });
}

function permissionContract(): ToolPermissionContract {
  return { extractResources: () => [], evaluate: () => ({ kind: "allow" as const }) };
}

const DESCRIPTION = [
  "Research a question with DeepSeek deep search: it plans several web searches and page reads on its own and returns concise findings with numbered sources.",
  "Use it for questions that need several sources or cross-checking. For a quick lookup use web_search; to read a known URL use web_fetch.",
  "Takes 10-60 seconds and is billed per search.",
  "The question must be self-contained: the search runs without this conversation's context.",
  "Each [n] in the result marks the source of the preceding text. When citing, write inline Markdown links with the listed URLs; never invent URLs.",
].join(" ");

type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  Object.freeze({
    localName: "deep_search" as const,
    definition: Object.freeze({
      abiVersion: 2, pluginId: DEEP_SEARCH_PLUGIN_ID, name: "deep_search", definitionVersion: 1, description: DESCRIPTION,
      inputSchema: Object.freeze({ type: "object", properties: { question: { type: "string", minLength: 1, maxLength: 4000, description: "A self-contained question or research task. Include names, dates and constraints: the search runs without this conversation's context." } }, required: ["question"], additionalProperties: false }),
      effects: [{ capabilityId: "network", mode: "use" as const, resourceScope: "workspace" }],
      modes: ["plan", "agent"], concurrency: "read-only", sensitiveArgumentPaths: [], resultSchemaVersion: 1,
    } satisfies ToolDefinition),
  }),
]);
