import { describe, expect, it } from "vitest";
import {
  CONTEXT_BUCKET_REGISTRY,
  CONTEXT_BUCKET_FALLBACK_COLOR_VAR,
  getContextBucketDisplay,
} from "../context-buckets";

describe("context bucket registry", () => {
  it("declares the wired bucket keys in display order", () => {
    // MCP / Subagents 暂未落地，已从注册表移除；新增 summarizedConversation 展示压缩摘要。
    expect(CONTEXT_BUCKET_REGISTRY.map((bucket) => bucket.key)).toEqual([
      "systemPrompt",
      "tools",
      "rules",
      "skills",
      "summarizedConversation",
      "conversation",
    ]);
  });

  it("every bucket declares a unique --act-context-* color var", () => {
    const colorVars = CONTEXT_BUCKET_REGISTRY.map((bucket) => bucket.colorVar);
    for (const colorVar of colorVars) {
      expect(colorVar.startsWith("--act-context-")).toBe(true);
    }
    expect(new Set(colorVars).size).toBe(colorVars.length);
  });

  it("resolves display info for a known bucket from the registry", () => {
    const display = getContextBucketDisplay("tools");
    expect(display.label).toBe("Tools");
    expect(display.colorVar).toBe("--act-context-tools");
  });

  it("falls back gracefully for an unknown bucket key (config not code)", () => {
    const display = getContextBucketDisplay("brandNewBucket");
    expect(display.label).toBe("brandNewBucket");
    expect(display.colorVar).toBe(CONTEXT_BUCKET_FALLBACK_COLOR_VAR);
    expect(display.order).toBeGreaterThan(
      Math.max(...CONTEXT_BUCKET_REGISTRY.map((bucket) => bucket.order)),
    );
  });
});
