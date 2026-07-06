import { describe, expect, it } from "vitest";
import { createToolManager, shouldExposeTool } from "../index";
import type { ToolDefinitionSpec } from "../types";

const baseSpec: ToolDefinitionSpec = {
  name: "example",
  description: "example",
  parameters: { type: "object", properties: {}, required: [] },
  isReadOnly: true,
  category: "search",
  previewKind: "generic",
};

describe("tool exposure", () => {
  it("exposes normal tools to any provider", () => {
    const spec: ToolDefinitionSpec = { ...baseSpec, name: "read_file" };

    expect(shouldExposeTool(spec, { primaryProvider: "deepseek" })).toBe(true);
    expect(shouldExposeTool(spec, { primaryProvider: "kimi" })).toBe(true);
  });

  it("limits exposeOnlyTo tools to the matching primary provider", () => {
    const spec: ToolDefinitionSpec = { ...baseSpec, exposeOnlyTo: "deepseek" };

    expect(shouldExposeTool(spec, { primaryProvider: "deepseek" })).toBe(true);
    expect(shouldExposeTool(spec, { primaryProvider: "kimi" })).toBe(false);
  });

  it("gates Kimi-backed tools on the Kimi key", () => {
    const spec: ToolDefinitionSpec = { ...baseSpec, exposeOnlyTo: "deepseek", requiresKey: "kimi" };

    expect(shouldExposeTool(spec, { primaryProvider: "deepseek", hasKimiKey: true })).toBe(true);
    expect(shouldExposeTool(spec, { primaryProvider: "deepseek", hasKimiKey: false })).toBe(false);
  });

  it("gates web_search on any search provider key regardless of provider or API format", () => {
    const spec: ToolDefinitionSpec = { ...baseSpec, name: "web_search", requiresKey: "webSearch" };

    for (const primaryProvider of ["deepseek", "kimi"] as const) {
      expect(shouldExposeTool(spec, { primaryProvider, hasWebSearchKey: true })).toBe(true);
      expect(shouldExposeTool(spec, { primaryProvider, hasWebSearchKey: false })).toBe(false);
    }
    expect(shouldExposeTool(spec, {
      primaryProvider: "deepseek",
      apiFormat: "anthropic",
      hasWebSearchKey: true,
    })).toBe(true);
  });

  it("registers web tools per key configuration in createToolManager", () => {
    const noKeys = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "deepseek",
      hasKimiKey: false,
      hasWebSearchKey: false,
    });
    const allKeys = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "deepseek",
      hasKimiKey: true,
      hasWebSearchKey: true,
    });
    const kimiPrimary = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "kimi",
      hasKimiKey: true,
      hasWebSearchKey: true,
    });

    // web_fetch 无 key 依赖，永远注册
    expect(noKeys.has("web_fetch")).toBe(true);
    expect(noKeys.has("web_search")).toBe(false);
    expect(noKeys.has("analyze_media")).toBe(false);

    expect(allKeys.has("web_fetch")).toBe(true);
    expect(allKeys.has("web_search")).toBe(true);
    expect(allKeys.has("analyze_media")).toBe(true);

    // web_search / web_fetch 不再绑定 DeepSeek：Kimi 主模型同样可用
    expect(kimiPrimary.has("web_search")).toBe(true);
    expect(kimiPrimary.has("web_fetch")).toBe(true);
    // analyze_media 仍是 DeepSeek 专属（Kimi 主模型自身就是多模态）
    expect(kimiPrimary.has("analyze_media")).toBe(false);
  });

  it("skips tools listed in disabledTools even when they are otherwise exposable", () => {
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "deepseek",
      hasKimiKey: true,
      hasWebSearchKey: true,
      disabledTools: ["read_file", "bash", "web_search"],
    });

    expect(manager.has("read_file")).toBe(false);
    expect(manager.has("bash")).toBe(false);
    expect(manager.has("web_search")).toBe(false);
    expect(manager.has("grep")).toBe(true);
    expect(manager.has("glob")).toBe(true);
    expect(manager.getToolDefinitions().some((tool) => tool.name === "bash")).toBe(false);
  });
});
