import { describe, expect, it } from "vitest";
import { ToolScheduler } from "../scheduler";
import type { InternalTool } from "../../internal-tools";

function createOutputTool(previewKind: InternalTool["previewKind"], output: string): InternalTool {
  return {
    name: previewKind,
    description: `Tool ${previewKind}`,
    parameters: { type: "object", properties: {}, required: [] },
    isReadOnly: true,
    previewKind,
    handler: async () => ({
      success: true,
      data: output,
      outputRef: { kind: "inline", value: "executor-owned-ref" },
    }),
  };
}

describe("ToolScheduler output post processing", () => {
  it("does not run Agent tool summaries through generic output compression", async () => {
    const longSummary = [
      "SubAgent run: Inspect contract",
      "Status: completed",
      `Summary: ${"完整 summary 片段 ".repeat(80)}`,
      "TranscriptRef: {\"kind\":\"subagent_transcript\",\"runId\":\"run-1\"}",
      "Stats: 3 tools, 1200ms",
    ].join("\n");
    const scheduler = new ToolScheduler({ truncateThreshold: 80 });

    const generic = await scheduler.execute(createOutputTool("generic", longSummary), "generic", {});
    expect(String(generic.result.data)).toContain("[已压缩摘要");

    const agent = await scheduler.execute(createOutputTool("agent", longSummary), "agent", {});
    expect(agent.result.data).toBe(longSummary);
    expect(String(agent.result.data)).not.toContain("[已压缩摘要");
    expect(agent.result.outputRef).toEqual({ kind: "inline", value: "executor-owned-ref" });
  });
});
