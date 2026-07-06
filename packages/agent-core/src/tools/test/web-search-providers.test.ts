import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderUnavailableError,
  createTavilyProvider,
  createTinyFishProvider,
  createZhipuProvider,
} from "../tools/web-search/providers";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zhipu provider", () => {
  it("maps search_result items into the shared shape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        search_result: [
          {
            title: "财经早资讯",
            link: "https://www.sohu.com/a/1",
            content: "一、对外直接投资增长。",
            publish_date: "2025-05-23",
          },
          { content: "missing link, dropped" },
        ],
      }),
    );

    const results = await createZhipuProvider("zhipu-key").search("财经新闻", 5);

    expect(results).toEqual([
      {
        title: "财经早资讯",
        url: "https://www.sohu.com/a/1",
        snippet: "一、对外直接投资增长。",
        publishedDate: "2025-05-23",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/web_search");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer zhipu-key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      search_engine: "search_pro",
      search_query: "财经新闻",
      count: 5,
    });
  });
});

describe("tinyfish provider", () => {
  it("sends the query as GET params and slices to maxResults", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          { position: 1, title: "A", url: "https://a.com", snippet: "sa" },
          { position: 2, title: "B", url: "https://b.com", snippet: "sb" },
          { position: 3, title: "C", url: "https://c.com", snippet: "sc" },
        ],
      }),
    );

    const results = await createTinyFishProvider("tf-key").search("web automation", 2);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ title: "A", url: "https://a.com", snippet: "sa" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://api.search.tinyfish.ai");
    expect(String(url)).toContain("query=web+automation");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("tf-key");
  });
});

describe("HTTP failure classification", () => {
  it("classifies 401 as auth unavailability", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "bad key" }, 401));

    await expect(createTavilyProvider("bad").search("q", 5)).rejects.toMatchObject({
      name: "ProviderUnavailableError",
      provider: "tavily",
      reason: "auth",
    });
  });

  it("classifies 432 as quota exhaustion", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "limit" }, 432));

    const err = await createTavilyProvider("k").search("q", 5).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(err.reason).toBe("quota");
  });

  it("keeps plain errors for 5xx failures", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const err = await createTavilyProvider("k").search("q", 5).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderUnavailableError);
    expect(err.message).toContain("HTTP 500");
  });
});
