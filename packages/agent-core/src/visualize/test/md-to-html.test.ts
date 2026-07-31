import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyUsage, type AssistantMessage } from "../../messages";
import type { LLMConfig } from "../../llm/types";
import { convertReplyToHtml, extractHtmlDocument, isCompleteHtmlDocument } from "../md-to-html";

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn() }));

vi.mock("../../llm/factory", () => ({
  createLLMService: () => ({ complete: completeMock }),
}));

const llmConfig: LLMConfig = {
  provider: "deepseek",
  api: "openai-completions",
  apiKey: "sk-main-only",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
};

function assistantMessage(input: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "<!doctype html><html><body>ok</body></html>" }],
    model: "deepseek-v4-pro",
    provider: "deepseek",
    usage: { ...createEmptyUsage(), input: 10, output: 20, totalTokens: 30 },
    stopReason: "stop",
    timestamp: Date.now(),
    ...input,
  };
}

beforeEach(() => {
  completeMock.mockReset();
});

describe("extractHtmlDocument", () => {
  it("strips a ```html fenced block", () => {
    const raw = ["这是说明", "```html", "<!doctype html><html><body>hi</body></html>", "```"].join("\n");
    expect(extractHtmlDocument(raw)).toBe("<!doctype html><html><body>hi</body></html>");
  });

  it("strips an unlabeled ``` fenced block", () => {
    const raw = ["```", "<!doctype html><p>x</p>", "```"].join("\n");
    expect(extractHtmlDocument(raw)).toBe("<!doctype html><p>x</p>");
  });

  it("slices from <!doctype html> when there is leading prose", () => {
    const raw = "Sure, here you go:\n<!doctype html>\n<html></html>";
    expect(extractHtmlDocument(raw)).toBe("<!doctype html>\n<html></html>");
  });

  it("slices from <html> when no doctype is present", () => {
    const raw = "preamble <html lang=\"en\"><body></body></html>";
    expect(extractHtmlDocument(raw)).toBe("<html lang=\"en\"><body></body></html>");
  });

  it("falls back to the trimmed raw text when no HTML markers exist", () => {
    expect(extractHtmlDocument("  just text  ")).toBe("just text");
  });

  it("recognizes only complete HTML documents as cacheable", () => {
    expect(isCompleteHtmlDocument("<!doctype html><html><body>ok</body></html>")).toBe(true);
    expect(isCompleteHtmlDocument("<html><body>missing doctype</body></html>")).toBe(false);
    expect(isCompleteHtmlDocument("<!doctype html><html><body>truncated")).toBe(false);
  });

  it("uses the explicit main-process LLM config and returns complete HTML", async () => {
    completeMock.mockResolvedValue(assistantMessage());

    const result = await convertReplyToHtml({ content: "# Reply", llmConfig });

    expect(result.html).toContain("<body>ok</body>");
    expect(result.usage.totalTokens).toBe(30);
    expect(completeMock).toHaveBeenCalledOnce();
  });

  it("throws the provider error instead of converting it into an empty success", async () => {
    completeMock.mockResolvedValue(assistantMessage({
      content: [],
      stopReason: "error",
      errorMessage: "DeepSeek API key not configured.",
      errorKind: "auth",
      usage: createEmptyUsage(),
    }));

    await expect(convertReplyToHtml({ content: "# Reply", llmConfig })).rejects.toThrow(
      "DeepSeek API key not configured.",
    );
  });

  it("rejects empty or incomplete model output", async () => {
    completeMock.mockResolvedValue(assistantMessage({ content: [] }));
    await expect(convertReplyToHtml({ content: "# Reply", llmConfig })).rejects.toThrow(
      "模型没有返回完整的 HTML 文档",
    );

    completeMock.mockResolvedValue(assistantMessage({
      content: [{ type: "text", text: "<!doctype html><html><body>truncated" }],
      stopReason: "length",
    }));
    await expect(convertReplyToHtml({ content: "# Reply", llmConfig })).rejects.toThrow(
      "生成未完整结束",
    );
  });
});
