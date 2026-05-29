import { describe, expect, it } from "vitest";
import { MockLLMService, mockText, mockError } from "../../../llm/services/mock";
import type { Context } from "../../../messages";
import { createSummarizer, SummarizerUnavailableError } from "../summarizer";

function mockLLM(): MockLLMService {
  return new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-flash" });
}

describe("createSummarizer", () => {
  it("selects the read prompt and passes input through for tool output", async () => {
    const llm = mockLLM();
    let seenSystemPrompt = "";
    let seenUser = "";
    llm.setResponses([
      (ctx: Context) => {
        seenSystemPrompt = ctx.systemPrompt ?? "";
        const user = ctx.messages.find((m) => m.role === "user");
        seenUser = user && typeof user.content === "string" ? user.content : "";
        return mockText("SUMMARY-READ");
      },
    ]);

    const summarizer = createSummarizer(llm);
    const out = await summarizer.summarizeToolOutput("read", "line content");

    expect(out).toBe("SUMMARY-READ");
    expect(seenSystemPrompt).toContain("行号");
    expect(seenUser).toBe("line content");
  });

  it("selects the grep prompt for grep/search kinds", async () => {
    const llm = mockLLM();
    let seenSystemPrompt = "";
    llm.setResponses([
      (ctx: Context) => {
        seenSystemPrompt = ctx.systemPrompt ?? "";
        return mockText("SUMMARY-GREP");
      },
    ]);

    const summarizer = createSummarizer(llm);
    await summarizer.summarizeToolOutput("grep", "matches");
    expect(seenSystemPrompt).toContain("命中行");
  });

  it("uses the 8-section history prompt for summarizeHistory", async () => {
    const llm = mockLLM();
    let seenSystemPrompt = "";
    llm.setResponses([
      (ctx: Context) => {
        seenSystemPrompt = ctx.systemPrompt ?? "";
        return mockText("HISTORY-SUMMARY");
      },
    ]);

    const summarizer = createSummarizer(llm);
    const out = await summarizer.summarizeHistory("serialized history");
    expect(out).toBe("HISTORY-SUMMARY");
    expect(seenSystemPrompt).toContain("8");
    expect(seenSystemPrompt).toContain("所有用户消息");
  });

  it("throws SummarizerUnavailableError on LLM error", async () => {
    const llm = mockLLM();
    llm.setResponses([mockError("boom")]);
    const summarizer = createSummarizer(llm);
    await expect(summarizer.summarizeToolOutput("generic", "x")).rejects.toBeInstanceOf(
      SummarizerUnavailableError,
    );
  });

  it("throws SummarizerUnavailableError on empty output", async () => {
    const llm = mockLLM();
    llm.setResponses([mockText("   ")]);
    const summarizer = createSummarizer(llm);
    await expect(summarizer.summarizeHistory("x")).rejects.toBeInstanceOf(
      SummarizerUnavailableError,
    );
  });
});
