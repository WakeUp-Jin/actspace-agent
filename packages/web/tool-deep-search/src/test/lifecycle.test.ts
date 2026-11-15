import { describe, expect, it, vi } from "vitest";
import { ToolRuntime } from "@actspace/tool-runtime";
import { apply, DEEP_SEARCH_HOST_PORT_ID, TOOL_DEFINITIONS, type HostPort, type ToolPorts } from "../plugin.js";
import { manifest } from "../manifest.js";

type Provided = { available: boolean; registrations: readonly unknown[] };
function fakeContext(runtime: ToolRuntime, host?: HostPort) {
  const provided = new Map<string, unknown>();
  let cleanup: (() => Promise<void>) | undefined;
  const ctx = {
    get: (id: string) => id === "tools.runtime" ? runtime : id === DEEP_SEARCH_HOST_PORT_ID ? host : undefined,
    provide: (id: string, value: unknown) => { provided.set(id, value); },
    effect: (factory: () => () => Promise<void>) => { cleanup = factory(); },
  };
  return { ctx: ctx as never, service: () => provided.get("tools.deep-search") as Provided, dispose: () => cleanup?.() };
}
const names = (runtime: ToolRuntime) => runtime.registry.listDefinitions().map(item => item.name);

describe("deep-search lifecycle", () => {
  it("declares one tool owned by its plugin in Plan and Agent", () => {
    expect(TOOL_DEFINITIONS.map(item => item.definition.name)).toEqual(["deep_search"]);
    expect(TOOL_DEFINITIONS[0]!.definition).toMatchObject({ pluginId: manifest.pluginId, modes: ["plan", "agent"], inputSchema: { required: ["question"] } });
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
    expect(names(runtime)).toEqual(["deep_search"]);
    state = false;
    expect(names(runtime)).toEqual([]);
    expect(runtime.registry.capture("deep_search").definition.name).toBe("deep_search");
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
    expect(() => runtime.registry.capture("deep_search")).toThrow(/not active/);
  });

  it("rejects a missing tool runtime", async () => {
    await expect(apply({ get: () => undefined } as never)).rejects.toThrow(/requires tools.runtime/);
  });
});
