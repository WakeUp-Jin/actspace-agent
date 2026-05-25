import { describe, it, expect } from "vitest";
import { InternalToolRegistry, toToolDefinition } from "../internal-tools";
import type { InternalTool, ToolResult } from "../internal-tools";

function createTool(name: string): InternalTool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: { x: { type: "string", description: "x" } }, required: [] },
    previewKind: "generic",
    handler: async (): Promise<ToolResult> => ({ success: true, data: name }),
  };
}

describe("InternalToolRegistry", () => {
  it("should register and retrieve tools", () => {
    const registry = new InternalToolRegistry();
    registry.register(createTool("a"));
    registry.register(createTool("b"));

    expect(registry.has("a")).toBe(true);
    expect(registry.has("b")).toBe(true);
    expect(registry.has("c")).toBe(false);
    expect(registry.get("a")?.name).toBe("a");
    expect(registry.getAll().length).toBe(2);
  });

  it("should create from array via static from()", () => {
    const registry = InternalToolRegistry.from([createTool("x"), createTool("y")]);
    expect(registry.getAll().length).toBe(2);
    expect(registry.has("x")).toBe(true);
    expect(registry.has("y")).toBe(true);
  });

  it("should export tool definitions", () => {
    const registry = InternalToolRegistry.from([createTool("read"), createTool("write")]);
    const defs = registry.getToolDefinitions();

    expect(defs.length).toBe(2);
    for (const def of defs) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("parameters");
    }
  });
});

describe("toToolDefinition", () => {
  it("should extract name, description, and parameters", () => {
    const tool = createTool("my_tool");
    const def = toToolDefinition(tool);

    expect(def.name).toBe("my_tool");
    expect(def.description).toBe("Tool my_tool");
    expect(def.parameters).toBeDefined();
  });

  it("should not include handler or internal fields", () => {
    const tool = createTool("my_tool");
    const def = toToolDefinition(tool);
    const keys = Object.keys(def);

    expect(keys).not.toContain("handler");
    expect(keys).not.toContain("isReadOnly");
    expect(keys).not.toContain("category");
  });
});
