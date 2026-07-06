import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWebFetchCache, webFetchExecutor } from "../tools/web-fetch/executor";

const fetchMock = vi.fn();

function htmlResponse(html: string, init?: { status?: number; contentType?: string; url?: string }): Response {
  const response = new Response(html, {
    status: init?.status ?? 200,
    headers: { "Content-Type": init?.contentType ?? "text/html; charset=utf-8" },
  });
  if (init?.url) Object.defineProperty(response, "url", { value: init.url });
  return response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  clearWebFetchCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webFetchExecutor", () => {
  it("requires url", async () => {
    const result = await webFetchExecutor({});
    expect(result.success).toBe(false);
    expect(result.error).toContain("url is required");
  });

  it("rejects non-http protocols and embedded credentials", async () => {
    expect((await webFetchExecutor({ url: "ftp://example.com" })).error).toContain("http");
    expect((await webFetchExecutor({ url: "https://user:pass@example.com" })).error).toContain(
      "credentials",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converts HTML to markdown and strips non-content elements", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(
        [
          "<html><head><title>Doc Title</title></head><body>",
          "<nav>navigation junk</nav>",
          "<h1>Heading</h1><p>Body <strong>text</strong>.</p>",
          '<div class="sidebar">sidebar junk</div>',
          "<script>evil()</script>",
          "</body></html>",
        ].join(""),
        { url: "https://example.com/doc" },
      ),
    );

    const result = await webFetchExecutor({ url: "https://example.com/doc" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("Title: Doc Title");
    expect(result.data).toContain("# Heading");
    expect(result.data).toContain("Body **text**.");
    expect(result.data).not.toContain("navigation junk");
    expect(result.data).not.toContain("sidebar junk");
    expect(result.data).not.toContain("evil()");
  });

  it("returns plain text content as-is", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse("plain body", { contentType: "text/plain; charset=utf-8" }),
    );

    const result = await webFetchExecutor({ url: "https://example.com/raw.txt" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("plain body");
  });

  it("fails with a clear message on HTTP errors", async () => {
    fetchMock.mockResolvedValue(htmlResponse("nope", { status: 404 }));

    const result = await webFetchExecutor({ url: "https://example.com/missing" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 404");
  });

  it("rejects binary content types", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse("binary", { contentType: "application/pdf" }),
    );

    const result = await webFetchExecutor({ url: "https://example.com/file.pdf" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported content type");
  });

  it("reports empty pages as likely JS-rendered", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse("<html><body><div id=\"root\"></div><script>app()</script></body></html>"),
    );

    const result = await webFetchExecutor({ url: "https://example.com/spa" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("JavaScript");
  });

  it("serves repeat fetches of the same URL from cache", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<html><body><p>cached</p></body></html>"));

    const first = await webFetchExecutor({ url: "https://example.com/cache-me" });
    const second = await webFetchExecutor({ url: "https://example.com/cache-me" });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("upgrades http URLs to https first", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<html><body><p>hi</p></body></html>"));

    await webFetchExecutor({ url: "http://example.com/page" });

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://example.com/page");
  });
});
