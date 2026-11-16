import { describe, expect, it, vi } from "vitest";
import { ToolRuntime, type ToolExecutionContext } from "@actspace/tool-runtime";
import { apply, DOCUMENT_GRANT_AUDIENCE, DOCUMENT_HOST_PORT_ID, registerTools, TOOL_DEFINITIONS, type HostPort, type ToolPorts } from "../plugin.js";
import { manifest } from "../manifest.js";

type Provided = { available: boolean; registrations: readonly unknown[] };
function fakeContext(runtime: ToolRuntime, host?: HostPort) {
  const provided = new Map<string, unknown>();
  let cleanup: (() => Promise<void>) | undefined;
  const ctx = {
    get: (id: string) => id === "tools.runtime" ? runtime : id === DOCUMENT_HOST_PORT_ID ? host : undefined,
    provide: (id: string, value: unknown) => { provided.set(id, value); },
    effect: (factory: () => () => Promise<void>) => { cleanup = factory(); },
  };
  return { ctx: ctx as never, service: () => provided.get("tools.document") as Provided, dispose: () => cleanup?.() };
}
const names = (runtime: ToolRuntime) => runtime.registry.listDefinitions().map(item => item.name);
const completed = { status: "completed" as const, summary: "doc.pdf · 1 page", modelOutput: [] };

describe("document lifecycle", () => {
  it("declares one tool owned by its plugin with no required arguments", () => {
    expect(TOOL_DEFINITIONS.map(item => item.definition.name)).toEqual(["read_document"]);
    expect(TOOL_DEFINITIONS[0]!.definition).toMatchObject({ pluginId: manifest.pluginId, modes: ["plan", "agent"], inputSchema: { required: [] } });
    for (const keyword of ["oneOf", "allOf", "anyOf"]) expect(TOOL_DEFINITIONS[0]!.definition.inputSchema).not.toHaveProperty(keyword);
  });

  it("registers nothing and reports unavailable without the Host port", async () => {
    const runtime = new ToolRuntime();
    const harness = fakeContext(runtime);
    await apply(harness.ctx);
    expect(harness.service()).toMatchObject({ available: false, registrations: [] });
    expect(names(runtime)).toEqual([]);
  });

  it("follows the Host port's availability, treats a throw as hidden, and keeps capture working", async () => {
    const runtime = new ToolRuntime();
    let state: boolean | "throw" = true;
    const harness = fakeContext(runtime, { createPorts: () => ({}), available: () => { if (state === "throw") throw new Error("boom"); return state; } });
    await apply(harness.ctx);
    expect(harness.service().available).toBe(true);
    expect(names(runtime)).toEqual(["read_document"]);
    state = false;
    expect(names(runtime)).toEqual([]);
    expect(runtime.registry.capture("read_document").definition.name).toBe("read_document");
    state = "throw";
    expect(names(runtime)).toEqual([]);
    await harness.dispose();
  });

  it("unregisters the tool before disposing the ports and aggregates dispose failures", async () => {
    const runtime = new ToolRuntime();
    const order: string[] = [];
    const ports: ToolPorts = { dispose: vi.fn(async () => { order.push(runtime.registry.listDefinitions().length === 0 ? "ports-after-unregister" : "ports-before-unregister"); throw new Error("dispose failed"); }) };
    const harness = fakeContext(runtime, { createPorts: () => ports, available: () => true });
    await apply(harness.ctx);
    await expect(harness.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(order).toEqual(["ports-after-unregister"]);
  });

  it("requires exactly one of path and artifact_id before calling the port", async () => {
    const runtime = new ToolRuntime();
    const port = vi.fn(async () => completed);
    registerTools(runtime, { read_document: port });
    const execute = runtime.registry.capture("read_document").executor.execute;
    const context = {} as ToolExecutionContext;
    expect(await execute({}, context)).toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    expect(await execute({ path: "a.pdf", artifact_id: "art-1" }, context)).toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    expect(port).not.toHaveBeenCalled();
    await execute({ path: "a.pdf" }, context);
    await execute({ artifact_id: "art-1" }, context);
    expect(port).toHaveBeenCalledTimes(2);
  });

  it("extracts a read file resource for path and none for artifact_id, under its own grant audience", async () => {
    const runtime = new ToolRuntime();
    registerTools(runtime, {});
    const permission = runtime.registry.capture("read_document").permission;
    expect(permission.grantAudience).toEqual(DOCUMENT_GRANT_AUDIENCE);
    const resource = { kind: "file" as const, canonicalPath: "/outside/a.pdf", access: "read" as const, targetKind: "file" as const };
    const context = { workspaceRoot: "/workspace", canonicalizeFile: vi.fn(async () => resource) };
    expect(await permission.extractResources({ path: "/outside/a.pdf" }, context as never)).toEqual([resource]);
    expect(context.canonicalizeFile).toHaveBeenCalledWith("/outside/a.pdf", "read");
    expect(await permission.extractResources({ artifact_id: "art-1" }, context as never)).toEqual([]);
    const suggestions = permission.suggestGrants?.({ path: "/outside/a.pdf" }, [resource], context as never) ?? [];
    expect(suggestions.map(item => item.selector.kind)).toEqual(["exact", "subtree"]);
  });
});
