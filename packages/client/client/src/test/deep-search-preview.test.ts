import { describe, expect, it } from "vitest";
import type { RuntimeToolView } from "@actspace/shared/runtime-v2";
import { toolPreview } from "../sessions/tool-card.js";
import { deepSearchFailureText } from "../sessions/tool-failure-text.js";

type Data = Parameters<typeof toolPreview>[2];
const call = { args: { question: "COP30 outcomes" } };
const detail = (value: unknown) => [{ label: "deep-search", value }];
const goodDetail = {
  queries: ["q1", "q2"],
  sources: [{ title: "Carbon Brief", url: "https://carbonbrief.org/x", site: "Carbon Brief" }, { title: "UN", url: "https://unfccc.int/y" }],
  failedPages: [{ url: "https://down.example/", code: "http_404" }],
  billed: { searches: 2, fetches: 0 },
};
const preview = (data: Data, phase: Parameters<typeof toolPreview>[7] = "finished", args: { args: Record<string, string> } = call, tool?: RuntimeToolView) =>
  toolPreview("deep_search", tool, data, args, undefined, "s", "r", phase);

describe("deep_search row projection", () => {
  it("shows just the question while running without progress", () => {
    for (const phase of ["streaming", "prepared", "running"] as const) {
      expect(preview({}, phase)).toEqual({ kind: "deep_search", question: "COP30 outcomes", displayText: "Deep Search COP30 outcomes" });
    }
  });

  it("appends recognised progress while running and ignores other summaries", () => {
    for (const progress of ["searching 3 queries", "searching 1 query", "reading 2 pages", "reading 1 page", "summarizing"]) {
      expect(preview({ summary: progress }, "running").displayText).toBe(`Deep Search COP30 outcomes · ${progress}`);
    }
    expect(preview({ summary: "Running" }, "running").displayText).toBe("Deep Search COP30 outcomes");
    expect(preview({ summary: "searching lots" }, "running").displayText).toBe("Deep Search COP30 outcomes");
  });

  it("projects a finished row with stats and the detail lists", () => {
    expect(preview({ status: "completed", summary: "2 searches · 2 sources", detail: detail(goodDetail) })).toEqual({
      kind: "deep_search", question: "COP30 outcomes", displayText: "Deep Search COP30 outcomes", stats: "2 searches · 2 sources",
      queries: goodDetail.queries, sources: goodDetail.sources, failedPages: goodDetail.failedPages,
    });
    expect(preview({ status: "completed", summary: "1 search · 1 source" }).stats).toBe("1 search · 1 source");
    expect(preview({ status: "completed", summary: "Tool completed" }).stats).toBeUndefined();
  });

  it.each([
    ["DEEP_SEARCH_UNAVAILABLE", "深度搜索已关闭或 DeepSeek 未连接。"],
    ["DEEP_SEARCH_IDLE_TIMEOUT", "40 秒没有收到新数据，已停止本次深度搜索。"],
    ["DEEP_SEARCH_TIMEOUT", "超过 120 秒仍未完成，已停止本次深度搜索。"],
    ["DEEPSEEK_AUTH_FAILED", "DeepSeek API Key 无效或已被删除。"],
    ["DEEPSEEK_INSUFFICIENT_BALANCE", "DeepSeek 账户余额不足，深度搜索没有执行。"],
    ["DEEPSEEK_RATE_LIMITED", "DeepSeek 请求过于频繁，稍后再试。"],
    ["DEEPSEEK_CONTENT_RISK", "DeepSeek 拒绝了这个问题（内容安全）。"],
    ["DEEP_SEARCH_FAILED", "DeepSeek deep search failed: HTTP 500"],
    ["SOMETHING_NEW", "DeepSeek deep search failed: HTTP 500"],
  ])("maps failure %s to its row text", (code, text) => {
    const row = preview({ status: "failed", summary: "x", failure: { code, message: "DeepSeek deep search failed: HTTP 500" } });
    expect(row).toMatchObject({ kind: "deep_search", errorText: text });
    expect(row).not.toHaveProperty("stats");
    expect(row).not.toHaveProperty("sources");
  });

  it("shows the hidden-tool denial like the unavailable failure", () => {
    expect(preview({ status: "denied", failure: { code: "TOOL_SCOPE_DENIED", message: "Tool is not in scope" } }).errorText).toBe("深度搜索已关闭或 DeepSeek 未连接。");
    expect(deepSearchFailureText(undefined, "raw")).toBe("raw");
  });

  it("has no stats, lists or error text when aborted", () => {
    expect(preview({ status: "aborted", summary: "x", failure: { code: "TOOL_ABORTED", message: "Deep search was aborted." } })).toEqual({ kind: "deep_search", question: "COP30 outcomes", displayText: "Deep Search COP30 outcomes" });
  });

  it("recovers the question and stats for a deferred history row from the args summary", () => {
    const tool = { state: "completed", summary: "6 searches · 11 sources", argsSummary: { text: "question=…", fields: [{ name: "question", value: "Who won?", redacted: false }] }, detail: [], artifacts: [], modelOutput: null, failure: null } as unknown as RuntimeToolView;
    const row = preview({}, "finished", { args: {} }, tool);
    expect(row).toEqual({ kind: "deep_search", question: "Who won?", displayText: "Deep Search Who won?", stats: "6 searches · 11 sources" });
    expect(preview({ status: "completed" }, "finished", { args: {} })).toMatchObject({ question: "", displayText: "Deep Search" });
  });

  it("truncates a long question in the row text but keeps it whole", () => {
    const long = "长".repeat(300);
    const row = preview({}, "running", { args: { question: long } });
    expect(row).toMatchObject({ question: long });
    expect(row.displayText).toBe(`Deep Search ${"长".repeat(240)}…`);
  });

  it("drops malformed detail entries and non-web URLs", () => {
    const row = preview({ status: "completed", summary: "1 search · 1 source", detail: detail({
      queries: ["ok", 3, "", "x".repeat(500)],
      sources: [{ title: "Good", url: "https://ok.example/" }, { title: "Bad", url: "javascript:alert(1)" }, { title: 5, url: "https://n.example/" }, "nope", { title: "No URL" }],
      failedPages: "not an array",
    }) });
    expect(row).toMatchObject({ queries: ["ok", "x".repeat(200)], sources: [{ title: "Good", url: "https://ok.example/" }, { title: "https://n.example/", url: "https://n.example/" }] });
    expect(row).not.toHaveProperty("failedPages");
    expect(preview({ status: "completed", summary: "1 search · 1 source", detail: detail("garbage") })).not.toHaveProperty("sources");
  });
});
