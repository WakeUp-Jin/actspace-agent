import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { getBashHardRejectReason } from "./command-rules.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext, ToolDefinition, ToolRuntime, ToolPermissionContract } from "@actspace/tools-runtime";
import type { CordisContext } from "@actspace/cordis-adapter";
import { SHELL_TOOLS_PLUGIN_ID, SHELL_TOOLS_TOOLS } from "./manifest.js";

export type ToolName = (typeof SHELL_TOOLS_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly hasRunningBackgroundTask?: (sessionId: string) => boolean; readonly dispose?: () => Promise<void> };
export const SHELL_TOOLS_HOST_PORT_ID = "actspace.host.tools.shell-tools" as const;
export type HostPort = { readonly createPorts: () => ToolPorts | Promise<ToolPorts> };
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntime["register"]> };

export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const host = ctx.get?.(SHELL_TOOLS_HOST_PORT_ID) as HostPort | undefined;
  if (!runtime || !host) throw new Error("shell-tools requires tools.runtime and actspace.host.tools.shell-tools.");
  const ports = await host.createPorts();
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports); }
  catch (error) { await ports.dispose?.(); throw error; }
  ctx.provide?.("tools.shell-tools", Object.freeze({ registrations, definitions: TOOL_DEFINITIONS, hasRunningBackgroundTask: ports.hasRunningBackgroundTask ?? (() => false) }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "shell-tools cleanup failed.");
  }, "shell-tools");
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
  if (name !== "bash") return { extractResources: () => [], evaluate: () => ({ kind: "allow" as const }) };
  const contract: ToolPermissionContract = {
    extractResources: (args, context) => {
      const command = typeof args.command === "string" ? args.command : "";
      return [{ kind: "process" as const, access: "execute" as const, commandDigest: createHash("sha256").update(command).digest("hex"), cwd: typeof args.cwd === "string" ? resolve(context.workspaceRoot, args.cwd) : context.workspaceRoot, dynamic: false }];
    },
    evaluate: (args, _resources, context) => {
      const command = typeof args.command === "string" ? args.command : "";
      const cwd = typeof args.cwd === "string" ? resolve(context.workspaceRoot, args.cwd) : context.workspaceRoot;
      const reason = getBashHardRejectReason(command, cwd, context.workspaceRoot);
      return reason ? { kind: "deny" as const, code: "BASH_COMMAND_DENIED", reason } : { kind: "ask" as const, reason: "Allow Bash to run this command once?", risk: "high" as const };
    },
  };
  return Object.freeze(contract);
}
type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
const SHELL = ["process"] as const;
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  definition("bash", "Run one non-interactive command in the workspace. Large output returns a bounded head plus a full output file reference. Read the resolved output path with read_file offset/limit or grep; do not rerun the command with head to recover output. Use dedicated file and search tools instead of shell equivalents.", SHELL, "exclusive", objectSchema({ command: stringSchema("Shell command."), cwd: stringSchema("Working directory."), blockMs: { type: "integer", minimum: 0, maximum: 600_000, default: 30_000 }, intent: { type: "string", minLength: 1, maxLength: 120 }, notifyOnOutput: { type: "object", properties: { pattern: stringSchema("Regular expression matched against output lines."), reason: { type: "string", minLength: 1, maxLength: 80 }, debounceMs: { type: "integer", minimum: 5_000, default: 5_000 } }, required: ["pattern", "reason"], additionalProperties: false }, requiredPermissions: { type: "array", items: { type: "string", enum: ["no_sandbox"] }, maxItems: 1 } }, ["command", "intent"]), ["/command"]),
  definition("bash_output", "Read new output or a bounded tail from a background bash task. Do not poll in a loop.", SHELL, "read-only", objectSchema({ taskId: stringSchema("Background task id."), tailLines: integerSchema("Optional tail line count.", 1) }, ["taskId"])),
  definition("bash_kill", "Terminate a background bash task by id.", SHELL, "exclusive", objectSchema({ taskId: stringSchema("Background task id.") }, ["taskId"])),
]);
export function activate() { return { services: { "tools.shell-tools": Object.freeze({ registerTools, TOOL_DEFINITIONS }) }, dispose: () => undefined }; }
function definition(localName: ToolName, description: string, capabilities: readonly string[], concurrency: ToolDefinition["concurrency"], inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = []): DefinitionEntry {
  return Object.freeze({ localName, definition: Object.freeze({ abiVersion: 2, pluginId: SHELL_TOOLS_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: capabilities.map((capabilityId) => ({ capabilityId, mode: capabilityId === "filesystem.write" ? "write" as const : capabilityId === "process" && localName !== "bash_output" ? "execute" as const : "use" as const, resourceScope: "workspace" })), concurrency, sensitiveArgumentPaths, resultSchemaVersion: 1 }) });
}
function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function stringSchema(description: string) { return Object.freeze({ type: "string", description, minLength: 1 }); }
function integerSchema(description: string, minimum: number) { return Object.freeze({ type: "integer", description, minimum }); }
