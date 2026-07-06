import { beforeEach, describe, expect, it, vi } from "vitest";
import { webSearchExecutor } from "../tools/web-search/executor";
import {
  ProviderUnavailableError,
  resolveSearchLanes,
  type SearchLanes,
  type WebSearchProvider,
  type WebSearchResultItem,
} from "../tools/web-search/providers";

vi.mock("../tools/web-search/providers", async (importOriginal) => {
  const original = await importOriginal<typeof import("../tools/web-search/providers")>();
  return { ...original, resolveSearchLanes: vi.fn() };
});

const resolveSearchLanesMock = vi.mocked(resolveSearchLanes);

function makeProvider(
  name: WebSearchProvider["name"],
  impl: () => Promise<WebSearchResultItem[]>,
): WebSearchProvider {
  return { name, search: vi.fn(impl) };
}

function items(prefix: string, count = 2): WebSearchResultItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `${prefix} result ${i + 1}`,
    url: `https://example.com/${prefix}/${i + 1}`,
    snippet: `${prefix} snippet ${i + 1}`,
  }));
}

function lanes(input: Partial<SearchLanes>): SearchLanes {
  return { domestic: input.domestic, international: input.international ?? [] };
}

describe("webSearchExecutor", () => {
  beforeEach(() => {
    resolveSearchLanesMock.mockReset();
  });

  it("requires query", async () => {
    const result = await webSearchExecutor({});
    expect(result.success).toBe(false);
    expect(result.error).toContain("query is required");
  });

  it("returns a guidance error when no provider key is configured", async () => {
    resolveSearchLanesMock.mockReturnValue(lanes({}));

    const result = await webSearchExecutor({ query: "latest news" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no search provider API key is configured");
    expect(result.error).toContain("Do not call web_search again in this turn");
  });

  it("runs domestic and international lanes in parallel and merges results grouped by provider", async () => {
    const zhipu = makeProvider("zhipu", async () => items("zhipu"));
    const tavily = makeProvider("tavily", async () => items("tavily"));
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu, international: [tavily] }));

    const result = await webSearchExecutor({ query: "latest news" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("Providers: tavily, zhipu");
    expect(result.data).toContain("## tavily (international — primary;");
    expect(result.data).toContain("## zhipu (domestic — supplementary;");
    expect(result.data).toContain("https://example.com/zhipu/1");
    expect(result.data).toContain("https://example.com/tavily/1");
    expect(zhipu.search).toHaveBeenCalledWith("latest news", 5);
    expect(tavily.search).toHaveBeenCalledWith("latest news", 5);
  });

  it("puts the international section before the domestic section", async () => {
    const zhipu = makeProvider("zhipu", async () => items("zhipu"));
    const tavily = makeProvider("tavily", async () => items("tavily"));
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu, international: [tavily] }));

    const result = await webSearchExecutor({ query: "ordering" });

    const data = result.data as string;
    expect(data.indexOf("## tavily")).toBeGreaterThan(-1);
    expect(data.indexOf("## tavily")).toBeLessThan(data.indexOf("## zhipu"));
  });

  it("dedupes cross-lane results by URL, keeping the international copy", async () => {
    const sharedUrl = "https://example.com/shared";
    const zhipu = makeProvider("zhipu", async () => [
      { title: "shared (zh)", url: sharedUrl, snippet: "中文版本" },
    ]);
    const tavily = makeProvider("tavily", async () => [
      { title: "shared (en)", url: sharedUrl, snippet: "english version" },
      ...items("tavily", 1),
    ]);
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu, international: [tavily] }));

    const result = await webSearchExecutor({ query: "shared page" });

    expect(result.success).toBe(true);
    const data = result.data as string;
    const occurrences = data.split(sharedUrl).length - 1;
    expect(occurrences).toBe(1);
    expect(data).toContain("shared (en)");
    expect(data).not.toContain("shared (zh)");
  });

  it("omits primary/supplementary tags when only one lane has results", async () => {
    const zhipu = makeProvider("zhipu", async () => items("zhipu"));
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu }));

    const result = await webSearchExecutor({ query: "domestic only" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("## zhipu (domestic;");
    expect(result.data).not.toContain("supplementary");
    expect(result.data).not.toContain("primary");
  });

  it("fails over to the next international provider on quota exhaustion", async () => {
    const tavily = makeProvider("tavily", async () => {
      throw new ProviderUnavailableError("tavily", "quota", "HTTP 432: usage limit exceeded");
    });
    const tinyfish = makeProvider("tinyfish", async () => items("tinyfish"));
    resolveSearchLanesMock.mockReturnValue(lanes({ international: [tavily, tinyfish] }));

    const result = await webSearchExecutor({ query: "failover" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("Providers: tinyfish");
    expect(result.data).toContain("https://example.com/tinyfish/1");
    expect(tavily.search).toHaveBeenCalled();
    expect(tinyfish.search).toHaveBeenCalled();
  });

  it("returns partial results with a note when one lane fails entirely", async () => {
    const zhipu = makeProvider("zhipu", async () => items("zhipu"));
    const exa = makeProvider("exa", async () => {
      throw new ProviderUnavailableError("exa", "auth", "HTTP 401: invalid key");
    });
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu, international: [exa] }));

    const result = await webSearchExecutor({ query: "partial" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("## zhipu (domestic;");
    expect(result.data).toContain("Note: international lane failed");
    expect(result.data).toContain("EXA_API_KEY may be invalid or expired");
  });

  it("fails with lane details when all providers fail", async () => {
    const zhipu = makeProvider("zhipu", async () => {
      throw new Error("fetch failed: ECONNRESET");
    });
    const tavily = makeProvider("tavily", async () => {
      throw new ProviderUnavailableError("tavily", "quota", "HTTP 432");
    });
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu, international: [tavily] }));

    const result = await webSearchExecutor({ query: "all fail" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Web search failed");
    expect(result.error).toContain("ECONNRESET");
    expect(result.error).toContain("quota exhausted");
  });

  it("reports no results when lanes succeed but return nothing", async () => {
    const zhipu = makeProvider("zhipu", async () => []);
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu }));

    const result = await webSearchExecutor({ query: "obscure query" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("returned no results");
  });

  it("clamps max_results into the 1-10 range", async () => {
    const zhipu = makeProvider("zhipu", async () => items("zhipu"));
    resolveSearchLanesMock.mockReturnValue(lanes({ domestic: zhipu }));

    await webSearchExecutor({ query: "clamp", max_results: 50 });
    expect(zhipu.search).toHaveBeenLastCalledWith("clamp", 10);

    await webSearchExecutor({ query: "clamp", max_results: 0 });
    expect(zhipu.search).toHaveBeenLastCalledWith("clamp", 1);
  });
});
