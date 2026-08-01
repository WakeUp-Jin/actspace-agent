import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "@actspace/shared";
import type { AssistantMessage, Context } from "../../../messages";
import type { LLMService } from "../../../llm/types";
import { compressKairosSegments } from "../compressor";
import { buildCompressionUserPrompt, getCompressionSystemPrompt } from "../prompts";

function fakeLLM(replyText: string): LLMService {
  const reply: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: replyText }],
    model: "mock",
    provider: "mock",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      cacheHit: 0,
      cacheMiss: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
  return {
    complete: vi.fn().mockResolvedValue(reply),
    stream: vi.fn(),
    streamSimple: vi.fn(),
    completeSimple: vi.fn().mockResolvedValue(reply),
  };
}

const event = (id: string): SessionEvent => ({
  id,
  sessionId: "s",
  agentRunId: "t",
  type: "user_message",
  timestamp: "2026-05-27T00:00:00.000Z",
  payload: { content: id },
});

describe("compressKairosSegments", () => {
  it("calls llm.complete with system prompt and event JSONL body", async () => {
    const llm = fakeLLM("# Summary\nsomething");
    const out = await compressKairosSegments({
      segments: [event("e1"), event("e2")],
      kind: "week",
      rangeLabel: "2026-05-20 ~ 2026-05-26",
      llm,
    });
    expect(out.markdown).toContain("Summary");
    expect(llm.complete).toHaveBeenCalledOnce();
    const ctx = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as Context;
    expect(ctx.systemPrompt).toBe(getCompressionSystemPrompt());
    const userMsg = ctx.messages[0];
    expect(userMsg.role).toBe("user");
    const text = typeof userMsg.content === "string" ? userMsg.content : "";
    expect(text).toContain("\"e1\"");
    expect(text).toContain("\"e2\"");
  });
});

describe("buildCompressionUserPrompt", () => {
  it("includes kind-specific header and range label", () => {
    const text = buildCompressionUserPrompt("month", "2026-05", "{}");
    expect(text).toContain("【月记忆】");
    expect(text).toContain("2026-05");
    expect(text).toContain("```jsonl");
  });
});
