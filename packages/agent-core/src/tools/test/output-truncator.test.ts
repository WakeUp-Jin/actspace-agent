import { describe, expect, it } from "vitest";
import { headTailTruncate, processToolOutput } from "../output-truncator";
import type { Summarizer } from "../../context/compression/summarizer";
import { SummarizerUnavailableError } from "../../context/compression/summarizer";

describe("headTailTruncate", () => {
  it("returns text unchanged when within cap", () => {
    expect(headTailTruncate("short", 100)).toBe("short");
  });

  it("preserves head and tail with an omission marker", () => {
    const text = "H".repeat(70) + "M".repeat(100) + "T".repeat(30);
    const out = headTailTruncate(text, 100);
    expect(out.startsWith("H".repeat(70))).toBe(true);
    expect(out.endsWith("T".repeat(30))).toBe(true);
    expect(out).toContain("中间省略");
    expect(out).toContain(`原始共 ${text.length} 字符`);
  });
});

describe("processToolOutput", () => {
  it("passes small output through unchanged without a notice", async () => {
    const out = await processToolOutput("generic", "tiny", { toolTruncateThreshold: 2000 });
    expect(out.modelOutput).toBe("tiny");
    expect(out.rawOutputRef).toEqual({ kind: "inline", value: "tiny" });
  });

  it("lets read-class tools pass through under the higher read threshold", async () => {
    const text = "x".repeat(5000); // > 2000 通用阈值，但 < 20000 读取类阈值
    const out = await processToolOutput("read", text, {});
    expect(out.modelOutput).toBe(text);
  });

  it("summarizes oversized output with a compression notice", async () => {
    const text = "y".repeat(3000);
    const summarizer: Summarizer = {
      summarizeToolOutput: async () => "FLASH-SUMMARY",
      summarizeHistory: async () => "",
    };
    const out = await processToolOutput("generic", text, { toolTruncateThreshold: 2000, summarizer });
    expect(out.modelOutput).toContain("[已压缩摘要");
    expect(out.modelOutput).toContain("FLASH-SUMMARY");
    expect(out.rawOutputRef).toEqual({ kind: "inline", value: text });
  });

  it("falls back to deterministic truncation when summarizer fails", async () => {
    const text = "z".repeat(3000);
    const summarizer: Summarizer = {
      summarizeToolOutput: async () => {
        throw new SummarizerUnavailableError("down");
      },
      summarizeHistory: async () => "",
    };
    const out = await processToolOutput("generic", text, { toolTruncateThreshold: 2000, summarizer });
    expect(out.modelOutput).toContain("[已压缩摘要");
    expect(out.modelOutput).toContain("中间省略");
  });

  it("falls back to deterministic truncation when no summarizer", async () => {
    const text = "w".repeat(3000);
    const out = await processToolOutput("web_search", text, { toolTruncateThreshold: 2000 });
    expect(out.modelOutput).toContain("[已压缩摘要");
    expect(out.modelOutput).toContain("中间省略");
  });
});
