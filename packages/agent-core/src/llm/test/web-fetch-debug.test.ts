/**
 * web_search 工具真实 API 调试测试（统一工具）
 *
 * 同一个工具处理两种场景：
 * - query 模式：关键词搜索
 * - url 模式：读取网页内容
 *
 * 运行：cd packages/agent-core && npx vitest run src/llm/test/web-fetch-debug.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { loadEnv, env } from "../../env";
import { searchWithKimi } from "../kimi-assistants";

function log(stage: string, data: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${stage}]`, JSON.stringify(data, null, 2));
}

describe("web_search unified tool (real API)", () => {
  beforeAll(() => {
    loadEnv();
    if (!env.KIMI_API_KEY) {
      console.warn("⚠️  KIMI_API_KEY not set, tests will skip");
    }
  });

  it("keyword search: returns search results", async () => {
    if (!env.KIMI_API_KEY) return;

    log("search-start", { query: "TypeScript 5.0 新特性" });
    const start = Date.now();

    const result = await searchWithKimi("TypeScript 5.0 新特性");

    log("search-done", {
      elapsedMs: Date.now() - start,
      answerLength: result.answer.length,
      answerPreview: result.answer.slice(0, 300),
    });

    expect(result.answer.length).toBeGreaterThan(20);
    expect(result.answer).not.toContain("No search results found");
  }, 60_000);

  it("url reading: returns page content", async () => {
    if (!env.KIMI_API_KEY) return;

    const url = "https://www.typescriptlang.org/";
    log("url-read-start", { url });
    const start = Date.now();

    const result = await searchWithKimi(`请读取以下网页的内容并总结要点：${url}`);

    log("url-read-done", {
      elapsedMs: Date.now() - start,
      answerLength: result.answer.length,
      answerPreview: result.answer.slice(0, 300),
    });

    expect(result.answer.length).toBeGreaterThan(20);
  }, 60_000);

  it("url reading with prompt: focused extraction", async () => {
    if (!env.KIMI_API_KEY) return;

    const url = "https://example.com/";
    log("url-prompt-start", { url });
    const start = Date.now();

    const result = await searchWithKimi(`请读取以下网页内容并提取页面标题和主要内容：${url}`);

    log("url-prompt-done", {
      elapsedMs: Date.now() - start,
      answerLength: result.answer.length,
      answerPreview: result.answer.slice(0, 300),
    });

    expect(result.answer.length).toBeGreaterThan(0);
  }, 60_000);
});
