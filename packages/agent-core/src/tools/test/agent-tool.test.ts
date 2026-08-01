import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
import {
  createExploreToolManager,
  parseAgentToolInput,
  resultFromAgentToolOutput,
  runExploreSubAgent,
} from "../tools/agent/runner";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = join(tmpdir(), `actspace-agent-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(workspaceRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe("Agent tool Explore runner", () => {
  it("creates a read-only Explore tool manager without recursive Agent access", () => {
    const manager = createExploreToolManager({ workspaceRoot });
    const toolNames = manager.getToolDefinitions().map((tool) => tool.name).sort();

    expect(toolNames).toEqual(["glob", "grep", "list_directory", "read_file"]);
    expect(toolNames).not.toContain("agent");
    expect(toolNames).not.toContain("bash");
    expect(toolNames).not.toContain("write_file");
    expect(toolNames).not.toContain("edit_file");
  });

  it("validates Agent input shape and V0 subagent_type", () => {
    expect(parseAgentToolInput({
      description: " Explore runtime ",
      prompt: " Inspect files ",
    })).toEqual({
      description: "Explore runtime",
      prompt: "Inspect files",
      subagent_type: "explore",
    });

    expect(parseAgentToolInput({
      description: "Explore runtime",
      prompt: "Inspect files",
      subagent_type: "writer",
    })).toBeNull();
  });

  it("runs an isolated read-only SubAgent and returns only summary/ref to the main tool result", async () => {
    const filePath = join(workspaceRoot, "notes.md");
    await writeFile(filePath, "SubAgent evidence lives here.");

    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    llm.setResponses([
      mockToolCall("read_file", { path: filePath }, { id: "tc-sub-read" }),
      mockText("Finding: notes.md contains SubAgent evidence."),
    ]);

    const sinkEvents: unknown[] = [];
    const output = await runExploreSubAgent({
      args: {
        description: "Explore notes",
        prompt: "Read notes.md and report the evidence.",
        subagent_type: "explore",
      },
      runtime: {
        llm,
        workspaceRoot,
        sessionId: "session-agent",
        agentRunId: "turn-main",
      },
      parentToolCallId: "tc-agent",
      eventSink: (event) => {
        sinkEvents.push(event);
      },
    });

    expect(output.status).toBe("completed");
    expect(output.summary).toBe("Finding: notes.md contains SubAgent evidence.");
    expect(output.transcriptRef).toMatchObject({
      kind: "subagent_transcript",
      sessionId: "session-agent",
      agentRunId: "turn-main",
    });
    expect(output.stats.toolCallCount).toBe(1);
    expect(output.stats.exploredFileCount).toBe(1);
    expect(output.transcriptEvents.map((event) => event.type)).toEqual([
      "user_message",
      "tool_call",
      "llm_usage",
      "tool_result",
      "assistant_message",
      "llm_usage",
    ]);
    expect(sinkEvents.length).toBeGreaterThan(0);
    expect(output.uiPreview).toMatchObject({
      kind: "agent",
      description: "Explore notes",
      status: "completed",
      summary: "Finding: notes.md contains SubAgent evidence.",
      stats: {
        toolCallCount: 1,
        exploredFileCount: 1,
      },
    });

    const toolResult = resultFromAgentToolOutput(output);
    expect(toolResult.success).toBe(true);
    expect(toolResult.data).toContain("SubAgent run: Explore notes");
    expect(toolResult.data).toContain("TranscriptRef:");
    expect(toolResult.subagent?.transcriptEvents).toHaveLength(output.transcriptEvents.length);
    expect(toolResult.outputRef?.kind).toBe("inline");
    expect(toolResult.outputRef?.value).not.toContain("SubAgent evidence lives here.");
  });

  it("allows deep Explore runs beyond the previous 12-turn cap before summarizing", async () => {
    const filePath = join(workspaceRoot, "frontend.md");
    await writeFile(filePath, "Frontend architecture evidence.");

    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    llm.setResponses([
      ...Array.from({ length: 13 }, (_, index) => (
        mockToolCall("read_file", { path: filePath }, { id: `tc-sub-read-${index + 1}` })
      )),
      mockText("Final frontend design panorama after deeper exploration."),
    ]);

    const output = await runExploreSubAgent({
      args: {
        description: "Explore frontend design",
        prompt: "Explore frontend design docs and code before reporting.",
        subagent_type: "explore",
      },
      runtime: {
        llm,
        workspaceRoot,
        sessionId: "session-agent",
        agentRunId: "turn-main",
      },
      parentToolCallId: "tc-agent",
    });

    expect(output.status).toBe("completed");
    expect(output.summary).toBe("Final frontend design panorama after deeper exploration.");
    expect(output.summary).not.toBe("Explore SubAgent completed without a text summary.");
    expect(output.stats.toolCallCount).toBe(13);
    expect(llm.state.callCount).toBe(14);
  });
});
