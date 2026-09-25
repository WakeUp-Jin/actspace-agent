import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { GrantAudience, RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutor, ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolDefinition } from "@actspace/tools-runtime";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { isPathWithin, type ToolGrantSuggestion, type ToolPermissionContract, type ToolResource } from "@actspace/tools-runtime";
import { CORE_TOOLS_MANIFEST, CORE_TOOLS_PLUGIN_ID } from "./manifest.js";
import { getBashHardRejectReason } from "./bash/command-rules.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import type { LlmService } from "@actspace/llm-service";

export type CoreToolName = (typeof CORE_TOOLS_MANIFEST.tools)[number];
export type CoreToolHandler = (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type CoreToolPorts = Partial<Readonly<Record<CoreToolName, CoreToolHandler>>> & { readonly dispose?: () => Promise<void> };

export type CoreToolRegistration = { readonly name: string; readonly localName: CoreToolName; readonly handle: ReturnType<ToolRuntime["register"]> };

export const CORE_TOOLS_HOST_PORT_ID = "actspace.host.tools.core" as const;
export type CoreToolsHostPort = {
  readonly createPorts: (llm: LlmService) => CoreToolPorts | Promise<CoreToolPorts>;
};

export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const llm = ctx.get?.("llm.service") as LlmService | undefined;
  const host = ctx.get?.(CORE_TOOLS_HOST_PORT_ID) as CoreToolsHostPort | undefined;
  if (runtime === undefined) throw new Error("Core Tools plugin requires tools.runtime.");
  if (llm === undefined) throw new Error("Core Tools plugin requires llm.service.");
  if (host === undefined) throw new Error(`Core Tools plugin requires ${CORE_TOOLS_HOST_PORT_ID}.`);
  const ports = await host.createPorts(llm);
  const registrations = registerCoreTools(runtime, ports);
  ctx.provide?.("tools.core", Object.freeze({ registrations, definitions: CORE_TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const disposers: Array<() => void | Promise<void>> = [...registrations].reverse().map((registration) => () => registration.handle.dispose());
    if (ports.dispose !== undefined) disposers.push(() => ports.dispose!());
    const results = await Promise.allSettled(disposers.map((dispose) => dispose()));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), "Core Tools cleanup failed.");
  }, "core-tools");
}

export function registerCoreTools(runtime: ToolRuntime, ports: CoreToolPorts): readonly CoreToolRegistration[] {
  return Object.freeze(CORE_TOOL_DEFINITIONS.map((definition) => {
    const handler = ports[definition.localName] ?? unavailableHandler(definition.localName);
    const handle = runtime.register({
      definition: definition.definition,
      executor: executor(handler),
      permission: permissionContract(definition.localName),
    });
    return Object.freeze({ name: definition.definition.name, localName: definition.localName, handle });
  }));
}

function permissionContract(name: CoreToolName): ToolPermissionContract {
  const fileAccess: "read" | "write" | undefined = name === "write_file" || name === "edit_file" ? "write" : name === "read_file" || name === "grep" || name === "glob" ? "read" : undefined;
  const contract: ToolPermissionContract = {
    ...(fileAccess === undefined ? {} : { grantAudience: CORE_FILE_GRANT_AUDIENCE }),
    extractResources: async (args, context): Promise<readonly ToolResource[]> => {
      if (typeof args.path === "string") {
        const access = name === "delete_file" ? "delete" : name === "write_file" || name === "edit_file" ? "write" : "read";
        return [await context.canonicalizeFile(args.path, access)];
      }
      if (name === "bash") {
        const command = typeof args.command === "string" ? args.command : "";
        return [{ kind: "process", access: "execute", commandDigest: createHash("sha256").update(command).digest("hex"), cwd: resolveWorkspaceCwd(context.workspaceRoot, args.cwd), dynamic: false }];
      }
      return [];
    },
    evaluate: (args, _resources, context) => {
      if (name === "bash") {
      const command = typeof args.command === "string" ? args.command : "";
        const cwd = resolveWorkspaceCwd(context.workspaceRoot, args.cwd);
        const reason = getBashHardRejectReason(command, cwd, context.workspaceRoot);
        if (reason !== undefined) return { kind: "deny" as const, code: "BASH_COMMAND_DENIED", reason };
        return { kind: "ask" as const, reason: "Allow Bash to run this command once?", risk: "high" as const };
      }
      if (name === "delete_file") return { kind: "ask" as const, reason: "Allow this file to be deleted once?", risk: "high" as const };
      return { kind: "allow" as const };
    },
    ...(fileAccess === undefined ? {} : {
      suggestGrants: (_args, resources, context) => {
        if (resources.length !== 1 || resources[0]?.kind !== "file" || resources[0].access !== fileAccess) return [];
        const resource = resources[0];
        const action = fileAccess === "read" ? "file.read" as const : "file.write" as const;
        const suggestions: ToolGrantSuggestion[] = [{ action, access: fileAccess, selector: { kind: "exact", canonicalPath: resource.canonicalPath }, label: "This file only" }];
        const parent = resource.targetKind === "directory" ? resource.canonicalPath : dirname(resource.canonicalPath);
        if (isSafeSubtreeCandidate(parent, context.workspaceRoot)) suggestions.push({ action, access: fileAccess, selector: { kind: "subtree" as const, canonicalRoot: parent }, label: "This directory tree" });
        return suggestions;
      },
    }),
  };
  return Object.freeze(contract);
}

const CORE_FILE_GRANT_AUDIENCE: GrantAudience = Object.freeze({ pluginId: CORE_TOOLS_PLUGIN_ID, permissionDomain: "core-files", policyVersion: 1 });

function isSafeSubtreeCandidate(path: string, workspaceRoot: string): boolean {
  const normalized = resolve(path);
  const home = resolve(homedir());
  return normalized !== "/" && normalized !== home && normalized !== resolve(home, "Documents") && normalized !== resolve(home, "Desktop") && !isPathWithin(normalized, workspaceRoot);
}

function resolveWorkspaceCwd(workspaceRoot: string, value: RuntimeV2JsonValue | undefined): string {
  return typeof value === "string" ? resolve(workspaceRoot, value) : workspaceRoot;
}

function executor(handler: CoreToolHandler): ToolExecutor {
  return Object.freeze({ concurrencySafe: true, execute: handler });
}

function unavailableHandler(name: string): CoreToolHandler {
  return async () => ({ status: "failed", modelOutput: [{ type: "text", text: `${name} Host capability is unavailable.` }], summary: `${name} unavailable`, failure: { code: "CAPABILITY_UNAVAILABLE", message: `${name} Host capability is unavailable.`, retryable: false } });
}

type DefinitionEntry = { readonly localName: CoreToolName; readonly definition: ToolDefinition };
const READ = ["filesystem.read"] as const;
const WRITE = ["filesystem.write"] as const;
const SHELL = ["process"] as const;
const WEB = ["network"] as const;
const IMAGE = ["network", "filesystem.write"] as const;

export const CORE_TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  definition("read_file", "Read a targeted line range from a workspace file. Prefer small ranges and page with offset/limit.", READ, "read-only", objectSchema({ path: stringSchema("File path, absolute or relative to workspace."), offset: integerSchema("Starting line, 1-based.", 1), limit: integerSchema("Maximum lines to read.", 1), force: { type: "boolean", default: false } }, ["path"])),
  definition("list_directory", "List files and subdirectories in a workspace directory. Use read_file for contents.", READ, "read-only", objectSchema({ path: stringSchema("Directory path, absolute or relative to workspace.") }, ["path"])),
  definition("grep", "Search file contents using a regular expression. Use glob to find paths by name.", READ, "read-only", objectSchema({ pattern: stringSchema("Regular expression."), path: stringSchema("Directory or file; defaults to workspace root."), glob: stringSchema("Optional file-name glob filter.") }, ["pattern"])),
  definition("glob", "Find workspace files by name pattern, sorted by modification time.", READ, "read-only", objectSchema({ pattern: stringSchema("Glob pattern, for example **/*.ts."), path: stringSchema("Search directory; defaults to workspace root.") }, ["pattern"])),
  definition("edit_file", "Replace one exact string in a file. Read the file first and include enough context for a unique match.", WRITE, "exclusive", objectSchema({ path: stringSchema("File path."), old_string: stringSchema("Exact text to replace."), new_string: stringSchema("Replacement text."), replace_all: { type: "boolean", default: false } }, ["path", "old_string", "new_string"]), ["/new_string"]),
  definition("write_file", "Write a complete small file atomically. Prefer edit_file for focused changes to existing files.", WRITE, "exclusive", objectSchema({ path: stringSchema("File path."), content: stringSchema("Complete file content.") }, ["path", "content"]), ["/content"]),
  definition("delete_file", "Delete one regular workspace file. Directories and glob deletion are unsupported.", WRITE, "exclusive", objectSchema({ path: stringSchema("Regular file path.") }, ["path"])),
  definition("bash", "Run one non-interactive command in the workspace. Large output returns a bounded head plus a full output file reference. Read the resolved output path with read_file offset/limit or grep; do not rerun the command with head to recover output. Use dedicated file and search tools instead of shell equivalents.", SHELL, "exclusive", objectSchema({ command: stringSchema("Shell command."), cwd: stringSchema("Working directory."), blockMs: { type: "integer", minimum: 0, maximum: 600_000, default: 30_000 }, intent: { type: "string", minLength: 1, maxLength: 120 }, notifyOnOutput: { type: "object", properties: { pattern: stringSchema("Regular expression matched against output lines."), reason: { type: "string", minLength: 1, maxLength: 80 }, debounceMs: { type: "integer", minimum: 5_000, default: 5_000 } }, required: ["pattern", "reason"], additionalProperties: false }, requiredPermissions: { type: "array", items: { type: "string", enum: ["no_sandbox"] }, maxItems: 1 } }, ["command", "intent"]), ["/command"]),
  definition("bash_output", "Read new output or a bounded tail from a background bash task. Do not poll in a loop.", SHELL, "read-only", objectSchema({ taskId: stringSchema("Background task id."), tailLines: integerSchema("Optional tail line count.", 1) }, ["taskId"])),
  definition("bash_kill", "Terminate a background bash task by id.", SHELL, "exclusive", objectSchema({ taskId: stringSchema("Background task id.") }, ["taskId"])),
  definition("web", "Search the public web or open a known public HTTP(S) URL. Use action=search with query, or action=open with url.", WEB, "read-only", { type: "object", properties: { action: { type: "string", enum: ["search", "open"] }, query: stringSchema("Specific search keywords for action=search."), max_results: { type: "integer", minimum: 1, maximum: 10, default: 5 }, url: { type: "string", pattern: "^https?://" } }, required: ["action"], additionalProperties: false, allOf: [{ if: { properties: { action: { const: "search" } } }, then: { required: ["query"] } }, { if: { properties: { action: { const: "open" } } }, then: { required: ["url"] } }] }),
  definition("web_search", "Search the public web and return raw result metadata. Use web_fetch to read a selected URL.", WEB, "read-only", objectSchema({ query: stringSchema("Specific search keywords."), max_results: { type: "integer", minimum: 1, maximum: 10, default: 5 } }, ["query"])),
  definition("web_fetch", "Fetch a known public HTTP(S) URL and normalize its content to Markdown or text.", WEB, "read-only", objectSchema({ url: { type: "string", pattern: "^https?://" } }, ["url"])),
  definition("generate_image", "Generate images from a detailed prompt using the configured image service.", IMAGE, "exclusive", objectSchema({ prompt: stringSchema("Detailed image description."), size: { type: "string", enum: ["1024x1024", "1536x1024", "1024x1536"], default: "1024x1024" }, n: { type: "integer", minimum: 1, maximum: 10, default: 1 } }, ["prompt"]), ["/prompt"]),
  definition("inspect_image", "Inspect an image artifact already owned by this Session and answer a specific visual question.", ["network"] as const, "read-only", objectSchema({ artifact_id: stringSchema("Session-owned image artifact id."), question: stringSchema("Specific visual question.") }, ["artifact_id", "question"])),
]);

export function activate() {
  return { services: { "tools.core": Object.freeze({ registerCoreTools, CORE_TOOL_DEFINITIONS }) }, dispose: () => undefined };
}

function definition(localName: CoreToolName, description: string, capabilities: readonly string[], concurrency: ToolDefinition["concurrency"], inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = []): DefinitionEntry {
  return Object.freeze({ localName, definition: Object.freeze({ abiVersion: 2, pluginId: CORE_TOOLS_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: capabilities.map((capabilityId) => ({ capabilityId, mode: capabilityId === "filesystem.write" ? "write" as const : capabilityId === "process" ? "execute" as const : "use" as const, resourceScope: "workspace" })), concurrency, sensitiveArgumentPaths, resultSchemaVersion: 1 }) });
}

function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function stringSchema(description: string) { return Object.freeze({ type: "string", description, minLength: 1 }); }
function integerSchema(description: string, minimum: number) { return Object.freeze({ type: "integer", description, minimum }); }
