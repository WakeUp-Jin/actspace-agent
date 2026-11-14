import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { GrantAudience } from "@actspace/shared/runtime-v2";
import { FILESYSTEM_HOST_PORT, isPathWithin, TOOL_RUNTIME_SERVICE, type ToolGrantSuggestion } from "@actspace/tool-runtime";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext, ToolDefinition, ToolRuntimeContract, ToolPermissionContract } from "@actspace/tool-runtime";
import { getService, type CordisContext } from "@actspace/cordis-adapter";
import { createNodeToolPorts } from "./node-ports.js";
import { FILESYSTEM_SEARCH_PLUGIN_ID, type FILESYSTEM_SEARCH_TOOLS } from "./manifest.js";

export type ToolName = (typeof FILESYSTEM_SEARCH_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly dispose?: () => Promise<void> };
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntimeContract["register"]> };

/**
 * The Host grants the filesystem (roots, artifact resolution); this plugin owns the tool implementation. Without the
 * grant every tool reports CAPABILITY_UNAVAILABLE instead of failing the Harness.
 */
export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = getService(ctx, TOOL_RUNTIME_SERVICE);
  if (!runtime) throw new Error("filesystem-search requires tools.runtime.");
  const grant = getService(ctx, FILESYSTEM_HOST_PORT);
  const ports: ToolPorts = grant ? createNodeToolPorts(grant) : {};
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports); }
  catch (error) { await ports.dispose?.(); throw error; }
  ctx.provide?.("tools.filesystem-search", Object.freeze({ registrations, definitions: TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "filesystem-search cleanup failed.");
  }, "filesystem-search");
}
export function registerTools(runtime: ToolRuntimeContract, ports: ToolPorts): readonly ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  try {
    for (const item of TOOL_DEFINITIONS) {
      const handler = ports[item.localName] ?? (async () => ({ status: "failed" as const, modelOutput: [{ type: "text" as const, text: `${item.localName} Host capability is unavailable.` }], summary: `${item.localName} unavailable`, failure: { code: "CAPABILITY_UNAVAILABLE", message: `${item.localName} Host capability is unavailable.`, retryable: false } }));
      registrations.push(Object.freeze({ name: item.definition.name, localName: item.localName, handle: runtime.register({ definition: item.definition, executor: { concurrencySafe: item.definition.concurrency !== "exclusive", execute: handler }, permission: permissionContract() }) }));
    }
    return Object.freeze(registrations);
  } catch (error) {
    for (const item of registrations.reverse()) item.handle.beginDrain();
    throw error;
  }
}

function permissionContract(): ToolPermissionContract {
  const access = "read" as const;
  const contract: ToolPermissionContract = {
    grantAudience: FILE_AUDIENCE,
    extractResources: async (args, context) => typeof args.path === "string" ? [await context.canonicalizeFile(args.path, access)] : [],
    evaluate: () => ({ kind: "allow" as const }),
    suggestGrants: (_args, resources, context) => {
      if (resources.length !== 1 || resources[0]?.kind !== "file" || resources[0].access !== access) return [];
      const resource = resources[0];
      const action = "file.read" as const;
      const suggestions: ToolGrantSuggestion[] = [{ action, access, selector: { kind: "exact", canonicalPath: resource.canonicalPath }, label: "This file only" }];
      const parent = resource.targetKind === "directory" ? resource.canonicalPath : dirname(resource.canonicalPath);
      if (isSafeSubtreeCandidate(parent, context.workspaceRoot)) suggestions.push({ action, access, selector: { kind: "subtree", canonicalRoot: parent }, label: "This directory tree" });
      return suggestions;
    },
  };
  return Object.freeze(contract);
}
const FILE_AUDIENCE: GrantAudience = Object.freeze({ pluginId: FILESYSTEM_SEARCH_PLUGIN_ID, permissionDomain: "filesystem-search", policyVersion: 1 });
function isSafeSubtreeCandidate(path: string, workspaceRoot: string): boolean { const normalized = resolve(path); const home = resolve(homedir()); return normalized !== "/" && normalized !== home && normalized !== resolve(home, "Documents") && normalized !== resolve(home, "Desktop") && !isPathWithin(normalized, workspaceRoot); }
type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
const READ = ["filesystem.read"] as const;
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  definition("grep", ["plan", "agent"], "Search file contents using a regular expression. Use glob to find paths by name.", READ, "read-only", objectSchema({ pattern: stringSchema("Regular expression."), path: stringSchema("Directory or file; defaults to workspace root."), glob: stringSchema("Optional file-name glob filter.") }, ["pattern"])),
  definition("glob", ["plan", "agent"], "Find workspace files by name pattern, sorted by modification time.", READ, "read-only", objectSchema({ pattern: stringSchema("Glob pattern, for example **/*.ts."), path: stringSchema("Search directory; defaults to workspace root.") }, ["pattern"])),
]);
function definition(localName: ToolName, modes: ToolDefinition["modes"], description: string, capabilities: readonly string[], concurrency: ToolDefinition["concurrency"], inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = []): DefinitionEntry {
  return Object.freeze({ localName, definition: Object.freeze({ abiVersion: 2, pluginId: FILESYSTEM_SEARCH_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: capabilities.map((capabilityId) => ({ capabilityId, mode: capabilityId === "filesystem.write" ? "write" as const : capabilityId === "process" ? "execute" as const : "use" as const, resourceScope: "workspace" })), modes, concurrency, sensitiveArgumentPaths, resultSchemaVersion: 1 }) });
}
function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function stringSchema(description: string) { return Object.freeze({ type: "string", description, minLength: 1 }); }
