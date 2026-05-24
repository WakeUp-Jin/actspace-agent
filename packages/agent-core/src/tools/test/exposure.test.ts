import { describe, expect, it } from "vitest";
import { createToolManager, shouldExposeTool } from "../index";
import type { ToolDefinitionSpec } from "../types";

const deepseekOnlySpec: ToolDefinitionSpec = {
  name: "web_search",
  description: "Search the web",
  parameters: { type: "object", properties: {}, required: [] },
  isReadOnly: true,
  category: "search",
  exposeOnlyTo: "deepseek",
};

describe("tool exposure", () => {
  it("exposes normal tools to any provider", () => {
    const spec: ToolDefinitionSpec = {
      ...deepseekOnlySpec,
      name: "read_file",
      exposeOnlyTo: undefined,
    };

    expect(shouldExposeTool(spec, { primaryProvider: "deepseek" })).toBe(true);
    expect(shouldExposeTool(spec, { primaryProvider: "kimi" })).toBe(true);
  });

  it("requires DeepSeek primary and a Kimi key for DeepSeek-only tools", () => {
    expect(shouldExposeTool(deepseekOnlySpec, { primaryProvider: "deepseek", hasKimiKey: true })).toBe(true);
    expect(shouldExposeTool(deepseekOnlySpec, { primaryProvider: "deepseek", hasKimiKey: false })).toBe(false);
    expect(shouldExposeTool(deepseekOnlySpec, { primaryProvider: "kimi", hasKimiKey: true })).toBe(false);
  });

  it("registers Kimi-assisted tools only for DeepSeek with a Kimi key", () => {
    const withoutKimi = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "deepseek",
      hasKimiKey: false,
    });
    const withKimi = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "deepseek",
      hasKimiKey: true,
    });
    const kimiPrimary = createToolManager({
      workspaceRoot: "/tmp",
      primaryProvider: "kimi",
      hasKimiKey: true,
    });

    expect(withoutKimi.has("web_search")).toBe(false);
    expect(withKimi.has("web_search")).toBe(true);
    expect(withKimi.has("web_fetch")).toBe(true);
    expect(withKimi.has("analyze_media")).toBe(true);
    expect(kimiPrimary.has("web_search")).toBe(false);
    expect(kimiPrimary.has("read_file")).toBe(true);
  });
});
