import { describe, it, expect } from "vitest";
import { ToolManager } from "../manager";
import type { InternalTool, ToolResult } from "../../internal-tools";
import type { ToolDefinitionSpec, ToolExecutorFn } from "../types";

function createSimpleTool(name: string, data = "ok"): InternalTool {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: { input: { type: "string", description: "input" } }, required: [] },
    isReadOnly: true,
    previewKind: "generic",
    handler: async (): Promise<ToolResult> => ({ success: true, data }),
  };
}

describe("ToolManager", () => {
  it("should register and retrieve tools", () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    manager.register(createSimpleTool("tool_a"));
    manager.register(createSimpleTool("tool_b"));

    expect(manager.has("tool_a")).toBe(true);
    expect(manager.has("tool_b")).toBe(true);
    expect(manager.has("tool_c")).toBe(false);

    expect(manager.get("tool_a")?.name).toBe("tool_a");
    expect(manager.getAll().length).toBe(2);
  });

  it("should register from spec + executor", () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });

    const spec: ToolDefinitionSpec = {
      name: "my_tool",
      description: "A tool",
      parameters: { type: "object", properties: {}, required: [] },
      isReadOnly: true,
      category: "test",
      previewKind: "generic",
    };
    const executor: ToolExecutorFn = async () => ({ success: true, data: "from spec" });

    manager.registerFromSpec(spec, executor);
    expect(manager.has("my_tool")).toBe(true);
  });

  it("should execute a registered tool", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    manager.register(createSimpleTool("tool_a", "hello world"));

    const result = await manager.execute("tool_a", { input: "test" });
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello world");
  });

  it("should execute a tool when permissions allow", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    let called = false;

    manager.register({
      ...createSimpleTool("allowed"),
      checkPermissions: async () => ({ decision: "allow" }),
      previewKind: "generic",
    handler: async () => {
        called = true;
        return { success: true, data: "allowed result" };
      },
    });

    const result = await manager.execute("allowed", {});
    expect(result.success).toBe(true);
    expect(result.data).toBe("allowed result");
    expect(called).toBe(true);
  });

  it("should pass sanitized args from permissions to handler", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    let receivedArgs: Record<string, unknown> | undefined;

    manager.register({
      ...createSimpleTool("sanitized"),
      checkPermissions: async () => ({
        decision: "allow",
        sanitizedArgs: { input: "clean" },
      }),
      previewKind: "generic",
    handler: async (args) => {
        receivedArgs = args;
        return { success: true, data: args.input };
      },
    });

    const result = await manager.execute("sanitized", { input: "dirty" });
    expect(result.success).toBe(true);
    expect(result.data).toBe("clean");
    expect(receivedArgs).toEqual({ input: "clean" });
  });

  it("should deny a tool without calling handler", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    let called = false;

    manager.register({
      ...createSimpleTool("denied"),
      checkPermissions: async () => ({
        decision: "deny",
        reason: "Dangerous operation",
      }),
      previewKind: "generic",
    handler: async () => {
        called = true;
        return { success: true, data: "should not run" };
      },
    });

    const result = await manager.execute("denied", {});
    expect(result.success).toBe(false);
    expect(result.error).toBe("Dangerous operation");
    expect(called).toBe(false);
  });

  it("should return awaiting approval for ask without calling handler", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    let called = false;

    manager.register({
      ...createSimpleTool("needs_approval"),
      checkPermissions: async () => ({
        decision: "ask",
        reason: "Not in allowlist",
        summary: "Run command",
        riskLevel: "medium",
        sanitizedArgs: { command: "pnpm install" },
      }),
      previewKind: "generic",
    handler: async () => {
        called = true;
        return { success: true, data: "should not run" };
      },
    });

    const result = await manager.execute("needs_approval", { command: "pnpm install" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not in allowlist");
    expect(called).toBe(false);
    expect(result.data).toMatchObject({
      status: "awaiting_approval",
      approvalRequest: {
        toolName: "needs_approval",
        args: { command: "pnpm install" },
        summary: "Run command",
        reason: "Not in allowlist",
        riskLevel: "medium",
      },
    });
  });

  it("should return error for unknown tool", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    const result = await manager.execute("nonexistent", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tool not found");
  });

  it("should catch handler errors", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    const tool: InternalTool = {
      ...createSimpleTool("failing"),
      previewKind: "generic",
    handler: async () => { throw new Error("boom"); },
    };
    manager.register(tool);

    const result = await manager.execute("failing", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("should truncate oversized output", async () => {
    const threshold = 100;
    const manager = new ToolManager({ workspaceRoot: "/tmp", truncateThreshold: threshold });
    const longData = "x".repeat(500);
    manager.register(createSimpleTool("big_tool", longData));

    const result = await manager.execute("big_tool", {});
    expect(result.success).toBe(true);
    const output = String(result.data);
    expect(output.length).toBeLessThan(500);
    expect(output).toContain("[Output truncated");
  });

  it("should not truncate small output", async () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp", truncateThreshold: 2000 });
    manager.register(createSimpleTool("small_tool", "short"));

    const result = await manager.execute("small_tool", {});
    expect(result.data).toBe("short");
  });

  it("should export tool definitions for LLM", () => {
    const manager = new ToolManager({ workspaceRoot: "/tmp" });
    manager.register(createSimpleTool("tool_a"));
    manager.register(createSimpleTool("tool_b"));

    const defs = manager.getToolDefinitions();
    expect(defs.length).toBe(2);
    expect(defs[0].name).toBe("tool_a");
    expect(defs[0]).toHaveProperty("description");
    expect(defs[0]).toHaveProperty("parameters");
  });
});
