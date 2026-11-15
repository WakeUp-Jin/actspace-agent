import { describe, expect, it } from "vitest";
import { estimateRequestInput } from "@actspace/shared";
import { EMPTY_LLM_USAGE, type LlmMessage, type LlmStreamEvent, type LlmUsage } from "@actspace/llm-service";
import type { ToolArtifactRef, ToolBodyResult } from "@actspace/tool-runtime";
import { runToolStreamFixture } from "../testing.js";
import { toolBatchOutputChars } from "../tool-output-budget.js";

describe("toolBatchOutputChars", () => {
  it("sets no budget when the context window is unknown", () => {
    expect(toolBatchOutputChars({ contextWindow: null, maxOutputTokens: 0, usedTokens: 10, keptTokens: 10 })).toBeUndefined();
    expect(toolBatchOutputChars({ contextWindow: 0, maxOutputTokens: 0, usedTokens: 10, keptTokens: 10 })).toBeUndefined();
    expect(toolBatchOutputChars({ contextWindow: Number.NaN, maxOutputTokens: 0, usedTokens: 10, keptTokens: 10 })).toBeUndefined();
  });

  it("allows half of what compaction can free while the context is short", () => {
    // 窗口 200,000，给回复留 16,000；压缩后留着 12,000，其余 172,000 的一半。
    expect(toolBatchOutputChars({ contextWindow: 200_000, maxOutputTokens: 0, usedTokens: 20_000, keptTokens: 12_000 })).toBe(86_000 * 4);
  });

  it("allows only what is left once the context is long", () => {
    expect(toolBatchOutputChars({ contextWindow: 200_000, maxOutputTokens: 0, usedTokens: 170_000, keptTokens: 12_000 })).toBe(14_000 * 4);
    expect(toolBatchOutputChars({ contextWindow: 200_000, maxOutputTokens: 0, usedTokens: 190_000, keptTokens: 12_000 })).toBe(0);
  });

  it("reserves the requested output size when it is larger than the default", () => {
    expect(toolBatchOutputChars({ contextWindow: 200_000, maxOutputTokens: 64_000, usedTokens: 100_000, keptTokens: 12_000 })).toBe(36_000 * 4);
  });

  it("reserves a quarter of a small window for the reply", () => {
    // 窗口 8,000：留 2,000，剩 6,000；压缩后留着 1,000，其余的一半是 2,500。
    expect(toolBatchOutputChars({ contextWindow: 8_000, maxOutputTokens: 0, usedTokens: 1_200, keptTokens: 1_000 })).toBe(2_500 * 4);
  });
});

/** 第一次请求发出 count 个并行的 read_file 调用，之后的请求直接回复。 */
function readsThenReply(count: number, usage: LlmUsage = EMPTY_LLM_USAGE): () => AsyncIterable<LlmStreamEvent> {
  let requests = 0;
  return async function* (): AsyncGenerator<LlmStreamEvent> {
    if (requests++ === 0) {
      yield { type: "done", stopReason: "tool-use", usage, content: Array.from({ length: count }, (_, index) => ({ type: "tool-call" as const, callId: `read-${index + 1}`, name: "read_file", arguments: JSON.stringify({ path: `file-${index + 1}.txt` }) })) };
      return;
    }
    yield { type: "text-delta", text: "Done." };
    yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Done." }] };
  };
}

function largeRead(chars: number): () => Promise<ToolBodyResult> {
  return async () => ({ status: "completed", summary: "Read file", modelOutput: [{ type: "text", text: "x".repeat(chars) }] });
}

function artifactStore() {
  const saved: string[] = [];
  const createArtifact = async (input: { readonly bytes: Uint8Array; readonly mediaType: string }): Promise<ToolArtifactRef> => {
    saved.push(Buffer.from(input.bytes).toString("utf8"));
    return { artifactId: `full-${saved.length}`, mediaType: input.mediaType, size: input.bytes.byteLength, sha256: "0".repeat(64) };
  };
  return { saved, createArtifact };
}

type ToolResultData = { readonly callId: string; readonly modelOutput: readonly { readonly type: string; readonly text?: string }[]; readonly artifacts: readonly unknown[] };

function toolResults(journal: readonly { readonly type: string; readonly data: unknown }[]): readonly ToolResultData[] {
  return journal.filter((event) => event.type === "tool/result").map((event) => event.data as ToolResultData);
}

function resultChars(result: ToolResultData): number {
  return result.modelOutput.reduce((sum, block) => sum + (block.text?.length ?? 400), 0);
}

describe("AgentLoop tool output budget", () => {
  it("cuts a batch of parallel reads so that the next request still fits a small window", async () => {
    const requests: (readonly LlmMessage[])[] = [];
    const { saved, createArtifact } = artifactStore();
    // 4 × 30,000 字符约 30,000 token，窗口只有 20,000。
    const { result, journal } = await runToolStreamFixture({
      contextWindow: 20_000, stream: readsThenReply(4), execute: largeRead(30_000), toolEnvironment: { createArtifact },
      onMessages: (messages) => { requests.push(messages); },
    });
    expect(result).toMatchObject({ reason: "completed", finalText: "Done." });
    expect(requests).toHaveLength(2);
    const results = toolResults(journal);
    expect(results.map((item) => item.callId)).toEqual(["read-1", "read-2", "read-3", "read-4"]);
    // 窗口给回复留 5,000，剩 15,000 的一半约 7,500 token，即 30,000 字符，四个调用各拿到一份。
    const sizes = results.map(resultChars);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(30_000);
    for (const size of sizes) { expect(size).toBeGreaterThan(6_000); expect(size).toBeLessThanOrEqual(7_500); }
    for (const item of results) {
      expect(item.modelOutput[0]?.text).toMatch(/^x+\n\n\[Output truncated: this tool returned 30000 characters and the context window has room for about \d+\. The first \d+ characters are shown\. The full output was saved as a file\.\]$/);
      expect(item.artifacts).toHaveLength(1);
    }
    expect(saved).toEqual(Array.from({ length: 4 }, () => "x".repeat(30_000)));
    // 第二次请求带着这一批结果，仍然在窗口之内，而且留着回复的空间。
    expect(estimateRequestInput({ messages: requests[1]!, tools: [] })).toBeLessThan(15_000);
  });

  it("leaves the same batch alone when the window has room for it", async () => {
    const { saved, createArtifact } = artifactStore();
    const { result, journal } = await runToolStreamFixture({ contextWindow: 200_000, stream: readsThenReply(4), execute: largeRead(30_000), toolEnvironment: { createArtifact } });
    expect(result.reason).toBe("completed");
    expect(toolResults(journal).map((item) => item.modelOutput)).toEqual(Array.from({ length: 4 }, () => [{ type: "text", text: "x".repeat(30_000) }]));
    expect(saved).toEqual([]);
  });

  it("sets no budget when the model's context window is unknown", async () => {
    const { journal } = await runToolStreamFixture({ stream: readsThenReply(2), execute: largeRead(200_000) });
    expect(toolResults(journal).map(resultChars)).toEqual([200_000, 200_000]);
  });

  it("allows only what is left of the window when the conversation already fills most of it", async () => {
    const requests: (readonly LlmMessage[])[] = [];
    const { createArtifact } = artifactStore();
    // 用户消息约 10,000 token；窗口 20,000 给回复留 5,000 后只剩约 5,000 token，即 20,000 字符。
    const { result, journal } = await runToolStreamFixture({
      contextWindow: 20_000, content: "u".repeat(40_000), stream: readsThenReply(1), execute: largeRead(30_000), toolEnvironment: { createArtifact },
      onMessages: (messages) => { requests.push(messages); },
    });
    expect(result.reason).toBe("completed");
    const [only] = toolResults(journal);
    expect(resultChars(only!)).toBeGreaterThan(17_000);
    expect(resultChars(only!)).toBeLessThanOrEqual(20_000);
    expect(estimateRequestInput({ messages: requests[1]!, tools: [] })).toBeLessThanOrEqual(15_000);
  });

  it("counts the usage the provider reported when it is higher than the estimate", async () => {
    const { createArtifact } = artifactStore();
    // 估算只有几百 token，Provider 报了 12,500：窗口 20,000 留 5,000 后还剩 2,500 token，即 10,000 字符。
    const { journal } = await runToolStreamFixture({
      contextWindow: 20_000, stream: readsThenReply(1, { ...EMPTY_LLM_USAGE, inputTokens: 12_000, outputTokens: 500 }), execute: largeRead(30_000), toolEnvironment: { createArtifact },
    });
    const [only] = toolResults(journal);
    expect(only!.modelOutput[0]?.text).toContain("the context window has room for about 10000.");
    expect(resultChars(only!)).toBeGreaterThan(8_000);
    expect(resultChars(only!)).toBeLessThanOrEqual(10_000);
  });
});
