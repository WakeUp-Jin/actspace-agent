import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { GrantAudience } from "@actspace/shared/runtime-v2";
import { isPathWithin, type ToolGrantSuggestion } from "@actspace/tools-runtime";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext, ToolDefinition, ToolRuntime, ToolPermissionContract } from "@actspace/tools-runtime";
import type { CordisContext } from "@actspace/cordis-adapter";
import { FILESYSTEM_READ_PLUGIN_ID, FILESYSTEM_READ_TOOLS, PRESENT_MAX_FILES } from "./manifest.js";

export type ToolName = (typeof FILESYSTEM_READ_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly dispose?: () => Promise<void> };
export const FILESYSTEM_READ_HOST_PORT_ID = "actspace.host.tools.filesystem-read" as const;
export type HostPort = { readonly createPorts: () => ToolPorts | Promise<ToolPorts> };
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntime["register"]> };

export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const host = ctx.get?.(FILESYSTEM_READ_HOST_PORT_ID) as HostPort | undefined;
  if (!runtime || !host) throw new Error("filesystem-read requires tools.runtime and actspace.host.tools.filesystem-read.");
  const ports = await host.createPorts();
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports); }
  catch (error) { await ports.dispose?.(); throw error; }
  ctx.provide?.("tools.filesystem-read", Object.freeze({ registrations, definitions: TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "filesystem-read cleanup failed.");
  }, "filesystem-read");
}
export function registerTools(runtime: ToolRuntime, ports: ToolPorts): readonly ToolRegistration[] {
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
const FILE_AUDIENCE: GrantAudience = Object.freeze({ pluginId: FILESYSTEM_READ_PLUGIN_ID, permissionDomain: "filesystem-read", policyVersion: 1 });
function isSafeSubtreeCandidate(path: string, workspaceRoot: string): boolean { const normalized = resolve(path); const home = resolve(homedir()); return normalized !== "/" && normalized !== home && normalized !== resolve(home, "Documents") && normalized !== resolve(home, "Desktop") && !isPathWithin(normalized, workspaceRoot); }
type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
const READ = ["filesystem.read"] as const;
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  definition("read_file", "Read a targeted line range from a workspace file. Prefer small ranges and page with offset/limit.", READ, "read-only", objectSchema({ path: stringSchema("File path, absolute or relative to workspace."), offset: integerSchema("Starting line, 1-based.", 1), limit: integerSchema("Maximum lines to read.", 1), force: { type: "boolean", default: false } }, ["path"])),
  definition("list_directory", "List files and subdirectories in a workspace directory. Use read_file for contents.", READ, "read-only", objectSchema({ path: stringSchema("Directory path, absolute or relative to workspace.") }, ["path"])),
  definition("present", "Declare existing files as final deliverables for the user. Use it when the user needs a separate file, especially Office documents, spreadsheets, and slide decks; prefer your final response when that suffices. The user opens the current files; their contents are not copied.", READ, "read-only", objectSchema({ files: { type: "array", description: "Usually the 1-2 most important deliverables; at most 4 per call.", minItems: 1, maxItems: PRESENT_MAX_FILES, items: objectSchema({ path: stringSchema("Path of an existing regular file in the workspace. Relative paths use the workspace root."), description: { type: "string", description: "Brief description for the user." } }, ["path"]) } }, ["files"])),
]);
function definition(localName: ToolName, description: string, capabilities: readonly string[], concurrency: ToolDefinition["concurrency"], inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = []): DefinitionEntry {
  return Object.freeze({ localName, definition: Object.freeze({ abiVersion: 2, pluginId: FILESYSTEM_READ_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: capabilities.map((capabilityId) => ({ capabilityId, mode: capabilityId === "filesystem.write" ? "write" as const : capabilityId === "process" ? "execute" as const : "use" as const, resourceScope: "workspace" })), concurrency, sensitiveArgumentPaths, resultSchemaVersion: 1 }) });
}
function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function stringSchema(description: string) { return Object.freeze({ type: "string", description, minLength: 1 }); }
function integerSchema(description: string, minimum: number) { return Object.freeze({ type: "integer", description, minimum }); }
