import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it, vi } from "vitest";
import { ToolRuntime } from "@actspace/tools-runtime";
import { apply, registerTools, TOOL_DEFINITIONS, IMAGE_INSPECTION_HOST_PORT_ID } from "../plugin.js";
import { manifest } from "../manifest.js";

describe("image-inspection lifecycle", () => {
  it("owns its manifest, registers exactly its tools, rejects duplicates and disposes", async () => {
    const runtime = new ToolRuntime();
    const registrations = registerTools(runtime, {});
    expect(runtime.registry.listDefinitions().map(item => item.pluginId)).toEqual(TOOL_DEFINITIONS.map(() => manifest.pluginId));
    expect(() => registerTools(runtime, {})).toThrow();
    for (const item of registrations) await item.handle.dispose();
    for (const item of TOOL_DEFINITIONS) expect(() => runtime.registry.capture(item.localName)).toThrow(/not active/);
  });
  it("rejects a missing Host port before registering", async () => {
    const runtime = new ToolRuntime();
    await expect(apply({ get: (id: string) => id === "tools.runtime" ? runtime : undefined } as never)).rejects.toThrow(/requires/);
    expect(runtime.registry.listDefinitions()).toEqual([]);
  });
  it("refuses to create unrecorded Host ports when the auxiliary recorder is missing", async () => {
    const runtime = new ToolRuntime();
    const createPorts = vi.fn(() => ({}));
    const services = new Map<string, unknown>([
      ["tools.runtime", runtime], ["llm.service", {}], [IMAGE_INSPECTION_HOST_PORT_ID, { createPorts }],
    ]);
    await expect(apply({ get: (id: string) => services.get(id) } as never)).rejects.toThrow(/llm\.auxiliary-requests/);
    expect(createPorts).not.toHaveBeenCalled();
    expect(runtime.registry.listDefinitions()).toEqual([]);
  });
  it("injects the Session recorder into Host ports and disposes their tools", async () => {
    const runtime = new ToolRuntime();
    const llm = {};
    const recorder = { start: vi.fn() };
    const dispose = vi.fn(async () => undefined);
    const createPorts = vi.fn(async () => ({ dispose }));
    const services = new Map<string, unknown>([
      ["tools.runtime", runtime], ["llm.service", llm],
      ["llm.auxiliary-requests", recorder], [IMAGE_INSPECTION_HOST_PORT_ID, { createPorts }],
    ]);
    let cleanup: (() => Promise<void>) | undefined;
    await apply({
      get: (id: string) => services.get(id),
      provide: (id: string, value: unknown) => services.set(id, value),
      effect: (setup: () => () => Promise<void>) => { cleanup = setup(); },
    } as never);
    expect(createPorts).toHaveBeenCalledWith(llm, recorder);
    expect(runtime.registry.listDefinitions().map(item => item.name)).toEqual(TOOL_DEFINITIONS.map(item => item.definition.name));
    expect(services.has("tools.image-inspection")).toBe(true);
    expect(cleanup).toBeTypeOf("function");
    await cleanup!();
    expect(dispose).toHaveBeenCalledOnce();
    expect(runtime.registry.listDefinitions()).toEqual([]);
  });
});
