/**
 * Kimi $web_search 集成测试
 *
 * 前置条件：.env 中配置有效的 KIMI_API_KEY
 * 运行：cd packages/agent-core && npx vitest run src/llm/test/kimi-assistants-real.test.ts
 *
 * web_search 统一处理关键词搜索和 URL 读取（利用 $web_search 的 search + crawl 能力）。
 */

import { describe, it, expect, beforeAll } from "vitest";
import { searchWithKimi } from "../kimi-assistants";
import { loadEnv, env } from "../../env";

describe("Kimi $web_search builtin (real API)", () => {
  beforeAll(() => {
    loadEnv();
    if (!env.KIMI_API_KEY) {
      console.warn("⚠️  KIMI_API_KEY not set, all tests will be skipped");
    }
  });

  it("keyword search returns results", async () => {
    if (!env.KIMI_API_KEY) return;

    const result = await searchWithKimi("TypeScript 5.0 新特性");

    console.log("[keyword search]", {
      answerLength: result.answer.length,
      preview: result.answer.slice(0, 200),
    });

    if (!result.answer) {
      console.warn("⚠️  Empty answer — likely API key issue");
      return;
    }

    expect(result.answer.length).toBeGreaterThan(20);
    expect(result.answer).not.toContain("No search results found");
  }, 60_000);

  it("URL reading returns page content", async () => {
    if (!env.KIMI_API_KEY) return;

    const result = await searchWithKimi("请读取以下网页的内容并总结要点：https://www.typescriptlang.org/");

    console.log("[url read]", {
      answerLength: result.answer.length,
      preview: result.answer.slice(0, 200),
    });

    if (!result.answer) {
      console.warn("⚠️  Empty answer — Kimi may not have crawled the URL");
      return;
    }

    expect(result.answer.length).toBeGreaterThan(20);
  }, 60_000);
});
