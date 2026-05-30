import { describe, expect, it } from "vitest";
import { createContextUsageSnapshot } from "../../context/token-estimator";
import type { Context, Usage } from "../../messages";
import { buildContextEntries, createContextState } from "../bridge";

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  cacheHit: 0,
  cacheMiss: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeContext(): Context {
  return {
    systemPrompt: "You are actspace, an agent-first coding assistant.",
    tools: [
      { name: "Bash", description: "Run a shell command.\n更多说明", parameters: {} },
      { name: "Read", description: "Read a file.", parameters: {} },
    ],
    messages: [
      { role: "user", content: "把刘备的生平做成可视化", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "text", text: "好的，我来整理刘备的关键节点。" }],
        timestamp: 2,
        model: "x",
        provider: "y",
        usage: ZERO_USAGE,
        stopReason: "stop",
      },
    ],
  };
}

describe("buildContextEntries", () => {
  it("emits one entry per system prompt / tool / message with role-encoded titles", () => {
    const entries = buildContextEntries(makeContext());

    const system = entries.find((entry) => entry.kind === "systemPrompt");
    expect(system?.preview).toContain("agent-first");

    // 每个工具一条，title=工具名，preview=完整描述（不再是「• 名 — 描述」清单）。
    const tools = entries.filter((entry) => entry.kind === "toolDefinitions");
    expect(tools.map((entry) => entry.title)).toEqual(["Bash", "Read"]);
    expect(tools[0]?.preview).toContain("Run a shell command");

    // 每条消息一条，title 编码 role。
    const conversation = entries.filter((entry) => entry.kind === "conversation");
    expect(conversation.map((entry) => entry.title)).toEqual(["User", "Assistant"]);
    expect(conversation[0]?.preview).toBe("把刘备的生平做成可视化");
    expect(conversation[1]?.preview).toBe("好的，我来整理刘备的关键节点。");
  });

  it("treats compaction user messages as the summarized-conversation bucket", () => {
    const entries = buildContextEntries({
      systemPrompt: "sp",
      messages: [
        { role: "user", content: "历史摘要正文", source: "compaction", timestamp: 1 },
        { role: "user", content: "最新一句", timestamp: 2 },
      ],
    });

    const summary = entries.filter((entry) => entry.kind === "summarizedConversation");
    expect(summary).toHaveLength(1);
    expect(summary[0]?.preview).toContain("历史摘要正文");

    const conversation = entries.filter((entry) => entry.kind === "conversation");
    expect(conversation).toHaveLength(1);
    expect(conversation[0]?.preview).toBe("最新一句");
  });

  it("labels tool results as `Tool · name` and keeps their output as preview", () => {
    const entries = buildContextEntries({
      systemPrompt: "",
      messages: [
        {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "Read",
          content: [{ type: "text", text: "file contents here" }],
          isError: false,
          timestamp: 1,
        },
      ],
    });

    const tool = entries.find((entry) => entry.kind === "conversation");
    expect(tool?.title).toBe("Tool · Read");
    expect(tool?.preview).toBe("file contents here");
  });
});

describe("createContextState", () => {
  it("persists only token stats with empty entries by default (方案 B)", () => {
    const snapshot = createContextUsageSnapshot({
      systemPromptTokens: 3200,
      toolsTokens: 1879,
      conversationTokens: 503,
    });
    const state = createContextState(snapshot, "session-1", "turn-1");

    expect(state.entries).toEqual([]);
    expect(state.buckets.length).toBeGreaterThan(0);
    expect(state.totalEstimatedTokens).toBe(snapshot.totalTokens);
  });

  it("carries supplied per-item entries through unchanged (describe path)", () => {
    const snapshot = createContextUsageSnapshot({
      systemPromptTokens: 3200,
      toolsTokens: 1879,
      conversationTokens: 503,
    });
    const entries = buildContextEntries(makeContext());
    const state = createContextState(snapshot, "session-1", "live", entries);

    expect(state.entries).toBe(entries);
    expect(state.activeTurnId).toBe("live");
  });
});
