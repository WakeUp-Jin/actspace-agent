import { describe, it, expect } from "vitest";
import { MockLLMService, mockText, mockError } from "../llm/services/mock";
import { generateSessionTitle, isDefaultSessionTitle } from "../session-title";

function flashLLM() {
  return new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
}

describe("isDefaultSessionTitle", () => {
  it("treats empty / New chat / Session <id> as default", () => {
    expect(isDefaultSessionTitle(undefined)).toBe(true);
    expect(isDefaultSessionTitle("")).toBe(true);
    expect(isDefaultSessionTitle("   ")).toBe(true);
    expect(isDefaultSessionTitle("New chat")).toBe(true);
    expect(isDefaultSessionTitle("Session session-abc")).toBe(true);
  });

  it("treats a user-provided title as non-default", () => {
    expect(isDefaultSessionTitle("修复工具流展示")).toBe(false);
  });
});

describe("generateSessionTitle", () => {
  it("returns a sanitized title from the flash reply", async () => {
    const llm = flashLLM();
    llm.setResponses([mockText('"修复工具流展示"。')]);

    const title = await generateSessionTitle(llm, {
      userInput: "工具流展示有两个 bug 要修",
      replyText: "好的，我先排查再修复。",
    });

    // 去包裹引号 + 去结尾标点。
    expect(title).toBe("修复工具流展示");
  });

  it("keeps only the first line of a multi-line reply", async () => {
    const llm = flashLLM();
    llm.setResponses([mockText("会话标题生成\n这是多余的解释")]);

    const title = await generateSessionTitle(llm, { userInput: "怎么自动生成标题", replyText: "用 flash" });
    expect(title).toBe("会话标题生成");
  });

  it("returns null when user input is empty", async () => {
    const llm = flashLLM();
    const title = await generateSessionTitle(llm, { userInput: "   ", replyText: "x" });
    expect(title).toBeNull();
  });

  it("returns null when the LLM errors", async () => {
    const llm = flashLLM();
    llm.setResponses([mockError("boom")]);
    const title = await generateSessionTitle(llm, { userInput: "hello", replyText: "hi" });
    expect(title).toBeNull();
  });

  it("returns null when the reply is empty", async () => {
    const llm = flashLLM();
    llm.setResponses([mockText("   ")]);
    const title = await generateSessionTitle(llm, { userInput: "hello", replyText: "hi" });
    expect(title).toBeNull();
  });
});
