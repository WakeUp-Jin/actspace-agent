import { describe, expect, it } from "vitest";
import { DeepSearchStreamState } from "../stream-state.js";
import { fixtureChunks } from "./helpers.js";

function replay(chunks: readonly unknown[]) {
  const state = new DeepSearchStreamState();
  const progress: string[] = [];
  for (const chunk of chunks) {
    const message = state.push(chunk);
    if (message !== undefined) progress.push(message);
  }
  return { state, progress };
}

const choice = (extra: Record<string, unknown>) => ({ choices: [{ index: 0, delta: {}, finish_reason: null, ...extra }], usage: null });
const event = (value: Record<string, unknown>) => choice({ server_tool_event: value });
const content = (text: string) => choice({ delta: { content: text } });
const finish = (reason: string, delta: Record<string, unknown> = {}, usage: unknown = null) => ({ choices: [{ index: 0, delta, finish_reason: reason }], usage });
const search = (step: number, index: number, queries: string[]) => event({ type: "call_started", step, call: { index, action: { type: "search", queries } } });
const openPage = (step: number, index: number, url: string) => event({ type: "call_started", step, call: { index, action: { type: "open_page", url } } });

describe("DeepSearchStreamState", () => {
  it("replays a search-then-read stream", () => {
    const { state, progress } = replay(fixtureChunks("search-and-read"));
    expect(progress).toEqual(["searching 3 queries", "reading 1 page", "reading 2 pages", "reading 3 pages", "reading 4 pages", "summarizing"]);
    const result = state.finish();
    if (!result.ok) throw new Error(result.failure.message);
    const { outcome } = result;
    expect(outcome.queries).toEqual(["2025年 中国 新能源汽车 全年 销量 渗透率", "2025年 比亚迪 全年 销量 中国", "2025年 特斯拉 中国 全年 销量"]);
    expect(outcome.billed).toEqual({ searches: 3, fetches: 0 });
    expect(outcome.searchQueryCount).toBe(3);
    expect(outcome.finishReason).toBe("stop");
    expect(outcome.annotations).toHaveLength(9);
    expect(outcome.annotations[0]).toMatchObject({ startIndex: 0, endIndex: 127, url: expect.stringMatching(/^https:\/\/www\.sohu\.com\//) });
    expect(outcome.lookup.get("http://auto.news18a.com/news/storys_224007.html")).toEqual({ title: "特斯拉2025年在华销量下滑至62.6万辆，排名跌至第五", site: "网通社汽车" });
    expect(outcome.failedPages).toEqual([]);
    expect(Array.from(outcome.content)).toHaveLength(381);
  });

  it("reports every step of a multi-step stream, only when the message changes", () => {
    const { state, progress } = replay(fixtureChunks("multi-step"));
    const reading = (n: number) => Array.from({ length: n }, (_, index) => index === 0 ? "reading 1 page" : `reading ${index + 1} pages`);
    expect(progress).toEqual(["searching 4 queries", ...reading(6), "searching 4 queries", ...reading(4), "summarizing"]);
    const result = state.finish();
    if (!result.ok) throw new Error(result.failure.message);
    expect(result.outcome.queries).toHaveLength(8);
    expect(result.outcome.billed).toEqual({ searches: 8, fetches: 0 });
    const decoded = [...result.outcome.lookup.keys()].find(url => url.startsWith("https://www.mofa.go.kr/"));
    expect(decoded).toContain("&srchTo=&srchWord=");
    expect(decoded).not.toContain("&amp;");
    expect(result.outcome.annotations.every(item => !item.url.includes("&amp;"))).toBe(true);
  });

  it("answers without searching", () => {
    const { state, progress } = replay(fixtureChunks("no-search"));
    expect(progress).toEqual(["summarizing"]);
    const result = state.finish();
    if (!result.ok) throw new Error(result.failure.message);
    expect(result.outcome).toMatchObject({ queries: [], annotations: [], failedPages: [], billed: {}, searchQueryCount: 0, finishReason: "stop" });
  });

  it("switches from searching to reading inside one step and uses singular forms", () => {
    const { progress } = replay([
      search(0, 0, ["only"]),
      event({ type: "call_completed", step: 0, call: { index: 0, status: "completed", sources: [] } }),
      openPage(0, 1, "https://a.example/"),
      event({ type: "call_started", step: 0, call: { index: 2, action: { type: "find_in_page", pattern: "x" } } }),
      openPage(0, 3, "https://b.example/"),
      search(1, 0, ["one", "two"]),
      content("x"),
      content("y"),
    ]);
    expect(progress).toEqual(["searching 1 query", "reading 1 page", "reading 2 pages", "searching 2 queries", "summarizing"]);
  });

  it("dedupes queries and records failed page opens from the events", () => {
    const { state } = replay([
      search(0, 0, ["q1", "q2"]),
      search(0, 1, ["q2", "q3"]),
      event({ type: "call_completed", step: 0, call: { index: 0, status: "completed", sources: [{ url: "https://a.example/x?a=1&amp;b=2", title: "A", site_name: "Site A" }] } }),
      event({ type: "call_completed", step: 0, call: { index: 1, status: "failed", error: { code: "timeout" } } }),
      openPage(1, 0, "https://down.example/"),
      event({ type: "call_completed", step: 1, call: { index: 0, status: "failed", error: { code: "http_404" } } }),
      openPage(1, 1, "https://ok.example/"),
      event({ type: "call_completed", step: 1, call: { index: 1, status: "completed", page: { url: "https://ok.example/", title: "OK" } } }),
      event({ type: "brand_new_event", step: 9 }),
      event({ type: "call_started", step: 1, call: { index: 2, action: { type: "teleport" } } }),
      content("Answer."),
      finish("stop"),
    ]);
    const result = state.finish();
    if (!result.ok) throw new Error(result.failure.message);
    expect(result.outcome.queries).toEqual(["q1", "q2", "q3"]);
    expect(result.outcome.searchQueryCount).toBe(2);
    expect(result.outcome.lookup.get("https://a.example/x?a=1&b=2")).toEqual({ title: "A", site: "Site A" });
    expect(result.outcome.lookup.get("https://ok.example/")).toEqual({ title: "OK" });
    expect(result.outcome.failedPages).toEqual([{ url: "https://down.example/", code: "http_404" }]);
    expect(result.outcome.billed).toEqual({});
  });

  it("rebuilds queries, sources and failed pages from the final server_tool_calls", () => {
    const { state } = replay([
      search(0, 0, ["streamed"]),
      content("Answer."),
      finish("stop", {
        annotations: [{ type: "url_citation", url_citation: { url: "https://a.example/", title: "A", start_index: 0, end_index: 7 } }],
        server_tool_calls: [
          { index: 0, reasoning_content: "…", calls: [{ index: 0, action: { type: "search", queries: ["final 1", "final 2"] }, status: "completed", sources: [{ url: "https://a.example/", title: "Final A", site_name: "A Site" }] }] },
          { index: 1, calls: [{ index: 0, action: { type: "open_page", url: "https://gone.example/" }, status: "failed", error: { code: "blocked" } }] },
        ],
      }, { server_tool_use: { tool_search: 2, tool_fetch: 1, tool_image_search: 0 } }),
    ]);
    const result = state.finish();
    if (!result.ok) throw new Error(result.failure.message);
    expect(result.outcome.queries).toEqual(["final 1", "final 2"]);
    expect(result.outcome.lookup.get("https://a.example/")).toEqual({ title: "Final A", site: "A Site" });
    expect(result.outcome.failedPages).toEqual([{ url: "https://gone.example/", code: "blocked" }]);
    expect(result.outcome.billed).toEqual({ searches: 2, fetches: 1 });
    expect(result.outcome.annotations).toEqual([{ url: "https://a.example/", title: "A", startIndex: 0, endIndex: 7 }]);
  });

  it("ignores reasoning content and malformed values", () => {
    const { state } = replay([
      choice({ delta: { reasoning_content: "thinking", content: null } }),
      "not an object", null, { choices: "nope" },
      content("Answer."),
      finish("length", { annotations: [{ type: "url_citation", url_citation: { url: 3 } }, { type: "other" }] }),
    ]);
    const result = state.finish();
    if (!result.ok) throw new Error(result.failure.message);
    expect(result.outcome).toMatchObject({ content: "Answer.", annotations: [], finishReason: "length" });
  });

  describe("failures", () => {
    it("fails on an error chunk and marks the stream as failed", () => {
      const { state } = replay([content("partial"), { error: { message: `upstream exploded ${"x".repeat(600)}`, type: "server_error" } }]);
      expect(state.failed).toBe(true);
      const result = state.finish();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure).toMatchObject({ code: "DEEP_SEARCH_FAILED", retryable: false });
      expect(result.failure.message.startsWith("DeepSeek deep search failed: upstream exploded")).toBe(true);
      expect(result.failure.message.length).toBeLessThanOrEqual("DeepSeek deep search failed: ".length + 500);
    });

    it("maps a content risk error chunk and a content_filter finish to DEEPSEEK_CONTENT_RISK", () => {
      const fromError = replay([{ error: { message: "Content Exists Risk" } }]).state.finish();
      const fromFinish = replay([content("x"), finish("content_filter")]).state.finish();
      for (const result of [fromError, fromFinish]) expect(result).toMatchObject({ ok: false, failure: { code: "DEEPSEEK_CONTENT_RISK", retryable: false } });
    });

    it("fails retryably when the stream ends before finish_reason", () => {
      expect(replay([content("half")]).state.finish()).toMatchObject({ ok: false, failure: { code: "DEEP_SEARCH_FAILED", retryable: true } });
    });

    it("fails on an empty answer or an unexpected finish reason", () => {
      expect(replay([content("  \n"), finish("stop")]).state.finish()).toMatchObject({ ok: false, failure: { code: "DEEP_SEARCH_FAILED", retryable: false } });
      expect(replay([content("x"), finish("tool_calls")]).state.finish()).toMatchObject({ ok: false, failure: { code: "DEEP_SEARCH_FAILED", retryable: false } });
    });
  });
});
