import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { GrantAudience, RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { isPathWithin, TOOL_RUNTIME_SERVICE, type ToolBodyResult, type ToolExecutionContext, type ToolDefinition, type ToolGrantSuggestion, type ToolRuntimeContract, type ToolPermissionContract } from "@actspace/tool-runtime";
import { getService, serviceKey, type CordisContext } from "@actspace/cordis-adapter";
import { DOCUMENT_HOST_PORT_ID, DOCUMENT_PLUGIN_ID, type DOCUMENT_TOOLS } from "./manifest.js";

export { DOCUMENT_HOST_PORT_ID } from "./manifest.js";
export type ToolName = (typeof DOCUMENT_TOOLS)[number];
export type ToolHandler = (args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;
export type ToolPorts = Partial<Readonly<Record<ToolName, ToolHandler>>> & { readonly dispose?: () => Promise<void> };
/** `createPorts()` builds the OCR implementation once per Harness; `available()` is the O(1) visibility predicate. */
export type HostPort = { readonly createPorts: () => ToolPorts | Promise<ToolPorts>; readonly available: () => boolean };
export const DOCUMENT_HOST_PORT = serviceKey<HostPort>(DOCUMENT_HOST_PORT_ID);
export type ToolRegistration = { readonly name: string; readonly localName: ToolName; readonly handle: ReturnType<ToolRuntimeContract["register"]> };
/** read_document's own grant audience: session grants for read_file do not cover it and vice versa. */
export const DOCUMENT_GRANT_AUDIENCE: GrantAudience = Object.freeze({ pluginId: DOCUMENT_PLUGIN_ID, permissionDomain: "document-read", policyVersion: 1 });

/**
 * The Host owns the DeepSeek key and switch, so the implementation comes through the Host port. Without the port the
 * tool is not registered; the service is still provided and marked unavailable.
 */
export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = getService(ctx, TOOL_RUNTIME_SERVICE);
  if (!runtime) throw new Error("document requires tools.runtime.");
  const host = getService(ctx, DOCUMENT_HOST_PORT);
  if (!host) {
    ctx.provide?.("tools.document", Object.freeze({ available: false, registrations: Object.freeze([]), definitions: TOOL_DEFINITIONS }));
    return;
  }
  const ports = await host.createPorts();
  let registrations: readonly ToolRegistration[];
  try { registrations = registerTools(runtime, ports, () => host.available()); }
  catch (error) { await ports.dispose?.(); throw error; }
  ctx.provide?.("tools.document", Object.freeze({ available: true, registrations, definitions: TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((item) => item.handle.dispose()));
    if (ports.dispose) results.push(...await Promise.allSettled([ports.dispose()]));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((item) => item.reason), "document cleanup failed.");
  }, "document");
}

export function registerTools(runtime: ToolRuntimeContract, ports: ToolPorts, visible?: () => boolean): readonly ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  try {
    for (const item of TOOL_DEFINITIONS) {
      const handler = exactlyOneSource(ports[item.localName] ?? unavailable(item.localName));
      registrations.push(Object.freeze({ name: item.definition.name, localName: item.localName, handle: runtime.register({ definition: item.definition, executor: { concurrencySafe: item.definition.concurrency !== "exclusive", execute: handler }, permission: permissionContract(), ...(visible === undefined ? {} : { visible }) }) }));
    }
    return Object.freeze(registrations);
  } catch (error) {
    for (const item of registrations.reverse()) item.handle.beginDrain();
    throw error;
  }
}

/** The argument validator has no `oneOf`, so "exactly one of path / artifact_id" is checked here, before the port. */
function exactlyOneSource(handler: ToolHandler): ToolHandler {
  return async (args, context) => {
    const sources = (typeof args.path === "string" ? 1 : 0) + (typeof args.artifact_id === "string" ? 1 : 0);
    if (sources === 1) return handler(args, context);
    const message = "Provide exactly one of path or artifact_id.";
    return { status: "failed", modelOutput: [{ type: "text", text: message }], summary: message, failure: { code: "INVALID_ARGUMENTS", message, retryable: false } };
  };
}

function unavailable(localName: ToolName): ToolHandler {
  const message = `${localName} Host capability is unavailable.`;
  return async () => ({ status: "failed" as const, modelOutput: [{ type: "text" as const, text: message }], summary: `${localName} unavailable`, failure: { code: "CAPABILITY_UNAVAILABLE", message, retryable: false } });
}

function permissionContract(): ToolPermissionContract {
  const access = "read" as const;
  const contract: ToolPermissionContract = {
    grantAudience: DOCUMENT_GRANT_AUDIENCE,
    extractResources: async (args, context) => typeof args.path === "string" ? [await context.canonicalizeFile(args.path, access)] : [],
    evaluate: () => ({ kind: "allow" as const }),
    suggestGrants: (_args, resources, context) => {
      if (resources.length !== 1 || resources[0]?.kind !== "file" || resources[0].access !== access) return [];
      const resource = resources[0];
      const action = "file.read" as const;
      const suggestions: ToolGrantSuggestion[] = [{ action, access, selector: { kind: "exact", canonicalPath: resource.canonicalPath }, label: "This file only" }];
      const parent = dirname(resource.canonicalPath);
      if (isSafeSubtreeCandidate(parent, context.workspaceRoot)) suggestions.push({ action, access, selector: { kind: "subtree", canonicalRoot: parent }, label: "This directory tree" });
      return suggestions;
    },
  };
  return Object.freeze(contract);
}

/** Same rule as tool-fs-read: never suggest a subtree grant for /, home, ~/Documents, ~/Desktop or the workspace. */
function isSafeSubtreeCandidate(path: string, workspaceRoot: string): boolean {
  const normalized = resolve(path);
  const home = resolve(homedir());
  return normalized !== "/" && normalized !== home && normalized !== resolve(home, "Documents") && normalized !== resolve(home, "Desktop") && !isPathWithin(normalized, workspaceRoot);
}

const DESCRIPTION = [
  "Read the text of a PDF, Word (DOC, DOCX) or PowerPoint (PPT, PPTX) document, including scanned pages, as Markdown.",
  "The file is sent to DeepSeek for recognition and billed per page.",
  "The first call parses the whole document and returns the first pages; call again with pages to read later pages without parsing again.",
  "Give exactly one of path or artifact_id.",
  "For spreadsheets, plain text or code use read_file or a script instead.",
].join(" ");

type DefinitionEntry = { readonly localName: ToolName; readonly definition: ToolDefinition };
export const TOOL_DEFINITIONS: readonly DefinitionEntry[] = Object.freeze([
  Object.freeze({
    localName: "read_document" as const,
    definition: Object.freeze({
      abiVersion: 2, pluginId: DOCUMENT_PLUGIN_ID, name: "read_document", definitionVersion: 1, description: DESCRIPTION,
      inputSchema: Object.freeze({
        type: "object",
        properties: {
          path: { type: "string", minLength: 1, description: "Path of a document on disk, absolute or relative to the workspace." },
          artifact_id: { type: "string", minLength: 1, description: "Id of a file the user attached, shown in the conversation as `Attached file: <name> (<id>)`." },
          pages: { type: "string", pattern: "^[1-9][0-9]{0,3}(-[1-9][0-9]{0,3})?$", description: "Pages to return, 1-based and inclusive, for example \"31-45\" or \"7\". Omit on the first call." },
        },
        required: [],
        additionalProperties: false,
      }),
      effects: [{ capabilityId: "network", mode: "use" as const, resourceScope: "workspace" }, { capabilityId: "filesystem.read", mode: "use" as const, resourceScope: "workspace" }],
      modes: ["plan", "agent"], concurrency: "read-only", sensitiveArgumentPaths: [], resultSchemaVersion: 1,
    } satisfies ToolDefinition),
  }),
]);
