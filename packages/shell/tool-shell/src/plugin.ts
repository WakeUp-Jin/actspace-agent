import { realpath } from "node:fs/promises";
import { analyzeCommandPrefixGrant } from "./command-prefix.js";
import { queryPathsWithinWorkspace } from "./query-paths.js";
import { HOST_WRITABLE_ROOTS_SERVICE, isPathWithin, PROCESS_HOST_PORT, TOOL_RUNTIME_SERVICE, type BundledPythonGrant, type ProcessHostGrant } from "@actspace/tool-runtime";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { getBashHardRejectReason } from "./command-rules.js";
import { detectScriptCommand, type RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext, ToolDefinition, ToolRuntimeContract, ToolPermissionContract } from "@actspace/tool-runtime";
import { ACTSPACE_SERVICE_DEFINITIONS, ACTSPACE_SERVICE_IDS, bindServiceType, getService, provideService, serviceView, type CordisContext } from "@actspace/cordis-adapter";
import { BACKGROUND_TASK_HOST_PORT, type BackgroundTaskHost } from "@actspace/background-tasks";
import { SANDBOX_SERVICE, type SandboxService } from "@actspace/sandbox/types";
import { SHELL_TOOLS_PLUGIN_ID, type SHELL_TOOLS_TOOLS } from "./manifest.js";
import { createNodeBashToolPorts } from "./node-ports.js";
import { ScratchOwners, sessionScratchDirectory } from "./scratch.js";

function createGrantedPorts(grant: ProcessHostGrant, background: BackgroundTaskHost | undefined, sandbox: SandboxService | undefined, dataRoot: string, scratchOwner: (sessionId: string) => string): ToolPorts {
  const ports = createNodeBashToolPorts({ workspaceRoot: grant.workspaceRoot, tmpRoot: grant.tmpRoot, dataRoot, sandbox, background, scratchOwner, ...(grant.python === undefined ? {} : { python: grant.python }) });
  grant.onProcesses?.(ports);
  return ports;
}

export type ToolName = (typeof SHELL_TOOLS_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & {
  readonly hasRunningBackgroundTask?: (sessionId: string) => boolean;
  /** Canonical Host-owned scratch directory; registered as Host-writable and accepted as a script location. */
  readonly scratchRoot?: string;
  /** The Python the app ships (from the process grant); absent when it does not. */
  readonly python?: BashPythonRuntime;
  readonly dispose?: () => Promise<void>;
};
/** The bundled Python as the process grant describes it; see `BundledPythonGrant` for what each field feeds. */
export type BashPythonRuntime = BundledPythonGrant;
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntimeContract["register"]> };
/** The `tools.shell-tools` service: what other plugins (the prompt, forks) read about Bash in this Harness. */
export type ShellToolsService = {
  readonly registrations: readonly ToolRegistration[];
  readonly definitions: typeof TOOL_DEFINITIONS;
  readonly hasRunningBackgroundTask: (sessionId: string) => boolean;
  readonly scratchRoot?: string;
  /** A Session's scratch directory (`ACTSPACE_SCRATCH` of its commands); absent without a scratch root. */
  readonly scratchDirectory?: (sessionId: string) => string;
  /** Makes `sessionId` work in `ownerSessionId`'s scratch directory until the returned function is called. */
  readonly shareScratchDirectory?: (sessionId: string, ownerSessionId: string) => () => void;
  readonly python?: BashPythonRuntime;
};
export const SHELL_TOOLS_SERVICE = bindServiceType<ShellToolsService>(ACTSPACE_SERVICE_DEFINITIONS.shellTools);
/** 这个包用到的 Session Host 端口：只要数据目录。 */
export const SHELL_SESSION_HOST_VIEW = serviceView<{ readonly dataRoot?: string }>(ACTSPACE_SERVICE_IDS.hostSession);

/**
 * The Host grants process execution (roots, shutdown hook); this plugin owns Bash itself. `sandbox` is absent when
 * the sandbox plugin is not loaded; commands then only run after approval for outside the sandbox. Without the
 * process grant, `bash` registers but reports CAPABILITY_UNAVAILABLE. `session.dataRoot` holds
 * `sessions-v2/<id>/bash-log/`, where command logs go.
 */
export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = getService(ctx, TOOL_RUNTIME_SERVICE);
  const dataRoot = getService(ctx, SHELL_SESSION_HOST_VIEW)?.dataRoot;
  if (!runtime || !dataRoot) throw new Error("shell-tools requires tools.runtime and actspace.host.session.");
  const sandbox = getService(ctx, SANDBOX_SERVICE);
  const grant = getService(ctx, PROCESS_HOST_PORT);
  const scratchOwners = new ScratchOwners();
  const ports: ToolPorts = grant ? createGrantedPorts(grant, getService(ctx, BACKGROUND_TASK_HOST_PORT), sandbox, dataRoot, scratchOwners.ownerOf) : {};
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports, sandbox); }
  catch (error) { await ports.dispose?.(); throw error; }
  // write_file / read_file inside the scratch directory need no workspace-scope approval; the Host cleans it up.
  const writableRoots = getService(ctx, HOST_WRITABLE_ROOTS_SERVICE);
  const scratchRoot = ports.scratchRoot;
  if (scratchRoot !== undefined) writableRoots?.add(scratchRoot);
  const service: ShellToolsService = Object.freeze({
    registrations, definitions: TOOL_DEFINITIONS, hasRunningBackgroundTask: ports.hasRunningBackgroundTask ?? (() => false), scratchRoot, python: ports.python,
    ...(scratchRoot === undefined ? {} : {
      scratchDirectory: (sessionId: string) => sessionScratchDirectory(scratchRoot, scratchOwners.ownerOf(sessionId)),
      shareScratchDirectory: (sessionId: string, ownerSessionId: string) => scratchOwners.share(sessionId, ownerSessionId),
    }),
  });
  provideService(ctx, SHELL_TOOLS_SERVICE, service);
  ctx.effect?.(() => async () => {
    if (scratchRoot !== undefined) writableRoots?.remove(scratchRoot);
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "shell-tools cleanup failed.");
  }, "shell-tools");
}
export function registerTools(runtime: ToolRuntimeContract, ports: ToolPorts, sandbox?: SandboxService): readonly ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  try {
    for (const item of TOOL_DEFINITIONS) {
      const handler = ports[item.localName] ?? (async () => ({ status: "failed" as const, modelOutput: [{ type: "text" as const, text: `${item.localName} Host capability is unavailable.` }], summary: `${item.localName} unavailable`, failure: { code: "CAPABILITY_UNAVAILABLE", message: `${item.localName} Host capability is unavailable.`, retryable: false } }));
      registrations.push(Object.freeze({ name: item.definition.name, localName: item.localName, handle: runtime.register({ definition: item.definition, executor: { concurrencySafe: item.definition.concurrency !== "exclusive", execute: handler }, permission: permissionContract(item.localName, sandbox, ports.scratchRoot) }) }));
    }
    return Object.freeze(registrations);
  } catch (error) {
    for (const item of registrations.reverse()) item.handle.beginDrain();
    throw error;
  }
}

/**
 * `noSandbox` on the process resource is what the user approves: `full-access`, an escalation request, or a sandbox that
 * is missing or cannot serve the tool template. Execution follows the admitted value, never a later mode or status.
 */
function permissionContract(name: ToolName, sandbox: SandboxService | undefined, scratchRoot?: string): ToolPermissionContract {
  if (name !== "bash") return { extractResources: () => [], evaluate: () => ({ kind: "allow" as const }) };
  const scriptRoots = scratchRoot === undefined ? [] : [scratchRoot];
  const contract: ToolPermissionContract = {
    grantAudience: { pluginId: SHELL_TOOLS_PLUGIN_ID, permissionDomain: "bash", policyVersion: 1 },
    extractResources: async (args, context) => {
      const command = typeof args.command === "string" ? args.command : "";
      const workspaceRoot = await realpath(context.workspaceRoot);
      const cwd = await realpath(resolve(context.workspaceRoot, typeof args.cwd === "string" ? args.cwd : "."));
      const noSandbox = context.mode === "full-access" || escalation(args) === "requested" || !(await sandbox?.status("tool"))?.available;
      let analysis = !noSandbox && isPathWithin(workspaceRoot, cwd) ? analyzeCommandPrefixGrant(command) : undefined;
      if (analysis && !await queryPathsWithinWorkspace(analysis, cwd, workspaceRoot, scriptRoots)) analysis = undefined;
      const script = detectScriptCommand(command);
      return [{ kind: "process" as const, access: "execute" as const, commandDigest: createHash("sha256").update(command).digest("hex"), cwd, workspaceRoot, noSandbox, dynamic: false, ...(analysis ? { argv: analysis.argv, grantPrefix: analysis.prefix } : {}), ...(script ? { script } : {}) }];
    },
    evaluate: (args, resources, context) => {
      const command = typeof args.command === "string" ? args.command : "";
      const cwd = typeof args.cwd === "string" ? resolve(context.workspaceRoot, args.cwd) : context.workspaceRoot;
      const reason = getBashHardRejectReason(command, cwd, context.workspaceRoot);
      if (reason) return { kind: "deny" as const, code: "BASH_COMMAND_DENIED", reason };
      const escalated = escalation(args);
      if (escalated === "invalid") return { kind: "deny" as const, code: "BASH_ESCALATION_INVALID", reason: "sandbox_permissions and justification must be given together." };
      if (context.mode === "full-access") return { kind: "allow" as const };
      if (escalated === "requested") return { kind: "ask" as const, reason: args.justification as string, risk: "high" as const, reusable: false };
      return { kind: "ask" as const, reason: "Allow Bash to run this command once?", risk: "high" as const, reusable: resources.some(resource => resource.kind === "process" && resource.grantPrefix !== undefined) };
    },
    suggestGrants: (_args, resources) => resources.flatMap(resource => resource.kind === "process" && resource.grantPrefix && resource.workspaceRoot && resource.noSandbox === false ? [{
      action: "process.execute" as const, access: "execute" as const,
      selector: { kind: "command_prefix" as const, prefix: resource.grantPrefix, cwdRoot: resource.workspaceRoot },
      label: `允许当前会话在当前工作区内运行符合规则的 ${resource.grantPrefix.join(" ")} 命令；执行环境沿用现有设置`,
    }] : []),
  };
  return Object.freeze(contract);
}
/** The schema checks each field; asking without saying why, or saying why without asking, is a malformed call in every mode. */
function escalation(args: Readonly<Record<string, RuntimeJsonValue>>): "none" | "requested" | "invalid" {
  const requested = args.sandbox_permissions === "require_escalated";
  const justified = typeof args.justification === "string" && args.justification.trim() !== "";
  return requested && justified ? "requested" : requested || "justification" in args ? "invalid" : "none";
}
type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
const SHELL = ["process"] as const;
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  definition("bash", ["agent"], "Run one non-interactive command in the workspace. Large output returns a bounded head plus a full output file reference. Read the resolved output path with read_file offset/limit or grep; do not rerun the command with head to recover output. Use dedicated file and search tools instead of shell equivalents. Unless the session is in full-access, the command runs in a sandbox: the workspace and the temp directory are writable; writes outside the workspace or to .git/hooks and .git/config are blocked, and so is the keychain (git push over HTTPS, gh); credential directories are not readable; the network is open.", SHELL, "exclusive", objectSchema({ command: stringSchema("Shell command."), cwd: stringSchema("Working directory."), blockMs: { type: "integer", minimum: 0, maximum: 600_000, default: 30_000 }, intent: { type: "string", minLength: 1, maxLength: 120 }, notifyOnOutput: { type: "object", properties: { pattern: stringSchema("Regular expression matched against output lines."), reason: { type: "string", minLength: 1, maxLength: 80 }, debounceMs: { type: "integer", minimum: 5_000, default: 5_000 } }, required: ["pattern", "reason"], additionalProperties: false }, sandbox_permissions: { type: "string", enum: ["require_escalated"], description: "Run this command outside the sandbox. Requires justification and asks the user to approve this one run. Request it only after the sandbox blocked the command, or when the command clearly must write outside the workspace or use the keychain (git push over HTTPS, gh; in the sandbox gh misreports its token as invalid). Do not request it up front." }, justification: { type: "string", minLength: 1, maxLength: 200, description: "One sentence shown to the user on the approval card: why this command must run outside the sandbox. Only with sandbox_permissions." } }, ["command", "intent"]), ["/command"]),
]);
function definition(localName: ToolName, modes: ToolDefinition["modes"], description: string, capabilities: readonly string[], concurrency: ToolDefinition["concurrency"], inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = []): DefinitionEntry {
  return Object.freeze({ localName, definition: Object.freeze({ abiVersion: 2, pluginId: SHELL_TOOLS_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: capabilities.map((capabilityId) => ({ capabilityId, mode: capabilityId === "filesystem.write" ? "write" as const : capabilityId === "process" ? "execute" as const : "use" as const, resourceScope: "workspace" })), modes, concurrency, sensitiveArgumentPaths, resultSchemaVersion: 1 }) });
}
function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[]) { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function stringSchema(description: string) { return Object.freeze({ type: "string", description, minLength: 1 }); }
