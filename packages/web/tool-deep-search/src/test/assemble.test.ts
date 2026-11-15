import { describe, expect, it } from "vitest";
import { assembleDeepSearchResult, type DeepSearchOutcome } from "../assemble.js";
import { DeepSearchStreamState } from "../stream-state.js";
import { fixtureChunks } from "./helpers.js";

function outcome(patch: Partial<DeepSearchOutcome> = {}): DeepSearchOutcome {
  return { content: "Answer.", annotations: [], queries: [], lookup: new Map(), failedPages: [], billed: {}, searchQueryCount: 0, finishReason: "stop", ...patch };
}
const text = (result: ReturnType<typeof assembleDeepSearchResult>) => {
  const block = result.modelOutput[0];
  if (block?.type !== "text") throw new Error("expected text output");
  return block.text;
};
const detail = (result: ReturnType<typeof assembleDeepSearchResult>) => result.detail?.find(item => item.label === "deep-search")?.value as {
  queries: string[]; sources: { title: string; url: string; site?: string }[]; failedPages: { url: string; code: string }[]; billed: { searches: number; fetches: number };
};
const cite = (url: string, endIndex: number, title?: string) => ({ url, startIndex: 0, endIndex, ...(title === undefined ? {} : { title }) });

describe("assembleDeepSearchResult", () => {
  it("assembles the recorded search-and-read stream", () => {
    const state = new DeepSearchStreamState();
    for (const chunk of fixtureChunks("search-and-read")) state.push(chunk);
    const finished = state.finish();
    if (!finished.ok) throw new Error(finished.failure.message);
    const result = assembleDeepSearchResult(finished.outcome);
    expect(result).toMatchObject({ status: "completed", summary: "3 searches · 7 sources" });
    const output = text(result);
    expect(output).toContain("Sources:\n[1] 2025年新能源车零售份额过半，机构预计今年增长10% — https://www.sohu.com/a/974403349_114986");
    expect(output).toMatch(/\[7\] .+ — https?:\/\//);
    expect(output).not.toContain("[8]");
    expect(output).not.toContain("Pages that could not be opened");
    expect(detail(result)).toMatchObject({ queries: finished.outcome.queries, billed: { searches: 3, fetches: 0 } });
    expect(detail(result).sources).toHaveLength(7);
  });

  it("inserts markers by code point, back to front, once per source and position", () => {
    const content = "😀 一。Two.";
    const result = assembleDeepSearchResult(outcome({
      content,
      annotations: [cite("https://b.example/", 8), cite("https://a.example/", 4), cite("https://a.example/", 4), cite("https://b.example/", 4)],
    }));
    expect(text(result).split("\n\n")[0]).toBe("😀 一。[1][2]Two.[2]");
    expect(text(result)).toContain("Sources:\n[1] https://a.example/\n[2] https://b.example/");
    expect(result.summary).toBe("0 searches · 2 sources");
  });

  it("numbers sources by first citation in the text and lists out-of-range citations without markers", () => {
    const result = assembleDeepSearchResult(outcome({
      content: "First. Second.",
      annotations: [cite("https://late.example/", 14), cite("https://outside.example/", 99), cite("https://early.example/", 6), cite("https://neg.example/", -1)],
    }));
    const output = text(result);
    expect(output.startsWith("First.[1] Second.[2]\n\n")).toBe(true);
    expect(output).toContain("[1] https://early.example/\n[2] https://late.example/\n[3] https://outside.example/\n[4] https://neg.example/");
    expect(result.summary).toBe("0 searches · 4 sources");
  });

  it("takes titles from the lookup, then the citation, then the URL", () => {
    const lookup = new Map([["https://a.example/", { title: "Looked Up", site: "A" }], ["https://u.example/", { title: "https://u.example/" }]]);
    const result = assembleDeepSearchResult(outcome({
      content: "x",
      lookup,
      annotations: [cite("https://a.example/", 1, "Citation A"), cite("https://b.example/", 1, "Citation B"), cite("https://c.example/", 1), cite("https://u.example/", 1)],
    }));
    expect(text(result)).toContain("[1] Looked Up — https://a.example/\n[2] Citation B — https://b.example/\n[3] https://c.example/\n[4] https://u.example/");
    expect(detail(result).sources).toEqual([
      { title: "Looked Up", url: "https://a.example/", site: "A" },
      { title: "Citation B", url: "https://b.example/" },
      { title: "https://c.example/", url: "https://c.example/" },
      { title: "https://u.example/", url: "https://u.example/" },
    ]);
  });

  it("says so when the model answered without searching", () => {
    const result = assembleDeepSearchResult(outcome({ content: "- 17 × 23 = 391" }));
    expect(text(result)).toBe("- 17 × 23 = 391\n\nNo web search was performed; these findings have no sources.");
    expect(result.summary).toBe("0 searches · 0 sources");
  });

  it("notes a truncated answer and lists pages that could not be opened", () => {
    const result = assembleDeepSearchResult(outcome({
      content: "Partial",
      queries: ["q"],
      searchQueryCount: 1,
      finishReason: "length",
      failedPages: [{ url: "https://down.example/", code: "http_404" }, { url: "ftp://files.example/", code: "x" }],
    }));
    expect(text(result)).toBe("Partial\n\n[The findings were cut off at DeepSeek's length limit.]\n\nNo sources were cited.\n\nPages that could not be opened:\n- https://down.example/ (http_404)");
    expect(result.summary).toBe("1 search · 0 sources");
    expect(detail(result).failedPages).toEqual([{ url: "https://down.example/", code: "http_404" }]);
  });

  it("caps the findings and the detail lists but not the counts", () => {
    const urls = Array.from({ length: 60 }, (_, index) => `https://s${index}.example/`);
    const result = assembleDeepSearchResult(outcome({
      content: "y".repeat(25_000),
      queries: Array.from({ length: 70 }, (_, index) => `${index} ${"q".repeat(300)}`),
      annotations: urls.map(url => cite(url, 1)),
      lookup: new Map([[urls[0]!, { title: "t".repeat(300), site: "s".repeat(150) }]]),
      failedPages: Array.from({ length: 30 }, (_, index) => ({ url: `https://f${index}.example/`, code: "x" })),
      billed: { searches: 70, fetches: 2 },
    }));
    const output = text(result);
    const findings = output.split("\n\nSources:")[0]!;
    expect(findings).toContain("[Findings truncated at 20,000 characters.]");
    expect(findings.length).toBeLessThan(20_400);
    expect(result.summary).toBe("70 searches · 60 sources");
    expect(output).toContain("[60] https://s59.example/");
    const value = detail(result);
    expect(value.queries).toHaveLength(50);
    expect(value.queries.every(query => query.length <= 200)).toBe(true);
    expect(value.sources).toHaveLength(50);
    expect(value.sources[0]!.title).toHaveLength(200);
    expect(value.sources[0]!.site).toHaveLength(100);
    expect(value.failedPages).toHaveLength(20);
    expect(value.billed).toEqual({ searches: 70, fetches: 2 });
  });

  it("drops citations and sources that are not http or https", () => {
    const result = assembleDeepSearchResult(outcome({
      content: "a b",
      annotations: [cite("javascript:alert(1)", 1), cite("file:///etc/passwd", 3), cite("https://ok.example/", 3), cite("not a url", 3)],
    }));
    expect(text(result).startsWith("a b[1]")).toBe(true);
    expect(text(result)).not.toMatch(/javascript:|file:|not a url/);
    expect(detail(result).sources.map(item => item.url)).toEqual(["https://ok.example/"]);
    expect(result.summary).toBe("0 searches · 1 source");
  });

  it("uses billed searches when present and falls back to the queries of searches that returned", () => {
    expect(assembleDeepSearchResult(outcome({ billed: { searches: 4 }, searchQueryCount: 9, queries: ["a"] })).summary).toBe("4 searches · 0 sources");
    const fallback = assembleDeepSearchResult(outcome({ searchQueryCount: 5, queries: ["a", "b"] }));
    expect(fallback.summary).toBe("5 searches · 0 sources");
    expect(detail(fallback).billed).toEqual({ searches: 5, fetches: 0 });
  });
});
