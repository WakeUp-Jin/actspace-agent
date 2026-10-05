import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { ToolRuntime } from "@actspace/tools-runtime";
import { apply, registerTools, TOOL_DEFINITIONS } from "../plugin.js";
import { manifest } from "../manifest.js";

describe("web-tools lifecycle", () => {
  it("publishes an Anthropic-compatible object schema for the Chat web tool", () => {
    const schema = TOOL_DEFINITIONS.find(item => item.localName === "web")!.definition.inputSchema;
    expect(schema).toMatchObject({ type: "object", required: ["action"], properties: { action: { enum: ["search", "open"] }, query: { type: "string" }, url: { type: "string" } } });
    for (const keyword of ["oneOf", "allOf", "anyOf"]) expect(schema).not.toHaveProperty(keyword);
  });
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
});
