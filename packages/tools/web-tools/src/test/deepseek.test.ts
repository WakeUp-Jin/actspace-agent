import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import { createNodeWebToolPorts } from "../node-ports.js";
const context = (signal = new AbortController().signal) => ({ signal }) as ToolExecutionContext;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const result = (url: string, title = url) => ({ title, url, summary: "summary", content: "snippet" });

describe("DeepSeek web integration", () => {
  it("aggregates three independent lanes, fuses duplicate ranks and applies the global limit", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("deepseek")) {
        expect(JSON.parse(String(init?.body))).toEqual({ query: "test", count: 2, need_content: false });
        return json({ results: [result("https://example.com/ds"), result("https://example.com/shared#part")] });
      }
      if (String(url).includes("bigmodel")) return json({ search_result: [{ title: "shared", link: "https://example.com/shared", content: "domestic" }] });
      return json({ results: [result("https://example.com/shared/"), result("https://example.com/international")] });
    });
    const ports = createNodeWebToolPorts({ credentials: { deepseek: "ds", zhipu: "zp", tavily: "tv" }, fetchImpl });
    const output = JSON.stringify(await ports.web_search!({ query: "test", max_results: 2 }, context()));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(output).toContain("1. https://example.com/shared#part");
    expect(output).toContain("Sources: deepseek, tavily, zhipu");
    expect(output).not.toContain("https://example.com/international");
  });

  it("observes source changes without replacing other lanes and tolerates a failed lane", async () => {
    let credentials = { deepseek: "ds", zhipu: "zp", tavily: "tv" } as { deepseek?: string; zhipu?: string; tavily?: string };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes("deepseek") ? json({}, 402) : String(url).includes("bigmodel") ? json({ search_result: [{ title: "zp", link: "https://example.com/zp" }] }) : json({ results: [result("https://example.com/tv")] }));
    const ports = createNodeWebToolPorts({ get credentials() { return credentials; }, fetchImpl });
    expect((await ports.web_search!({ query: "test" }, context())).status).toBe("completed");
    credentials = { zhipu: "zp", tavily: "tv" }; fetchImpl.mockClear();
    await ports.web_search!({ query: "test" }, context()); expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes("deepseek"))).toBe(true);
    credentials = { deepseek: "ds", tavily: "tv" }; fetchImpl.mockClear();
    await ports.web_search!({ query: "test" }, context()); expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes("bigmodel"))).toBe(true);
  });

  it("does not pay for fetch with a search key alone and isolates local/remote caches on live toggles", async () => {
    let key: string | undefined;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes("api.deepseek") ? json({ title: "remote", content: "remote body" }) : new Response("local body"));
    const ports = createNodeWebToolPorts({ credentials: { deepseek: "ds" }, get deepseekFetchApiKey() { return key; }, fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    const args = { url: "https://example.com/page" };
    expect(JSON.stringify(await ports.web_fetch!(args, context()))).toContain("local body");
    key = "ds";
    expect(JSON.stringify(await ports.web!({ ...args, action: "open" }, context()))).toContain("remote body");
    await ports.web_fetch!(args, context()); expect(fetchImpl).toHaveBeenCalledTimes(2);
    key = undefined;
    expect(JSON.stringify(await ports.web_fetch!(args, context()))).toContain("local body");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([401, 402, 404, 429, 500])("falls back to local for HTTP %i without leaking credentials", async (status) => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes("api.deepseek") ? json({ error: "secret-ds-key" }, status) : new Response("local body"));
    const ports = createNodeWebToolPorts({ deepseekFetchApiKey: "secret-ds-key", fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    const output = JSON.stringify(await ports.web_fetch!({ url: "https://example.com" }, context()));
    expect(output).toContain("local body"); expect(output).toContain("DeepSeek fallback"); expect(output).not.toContain("secret-ds-key");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not fall back on safety rejection, private targets or cancellation", async () => {
    const fetchImpl = vi.fn(async () => json({}, 403));
    const ports = createNodeWebToolPorts({ deepseekFetchApiKey: "ds", fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    expect(await ports.web_fetch!({ url: "https://example.com" }, context())).toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_URL_DENIED" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1); fetchImpl.mockClear();
    await ports.web_fetch!({ url: "http://127.0.0.1" }, context()); expect(fetchImpl).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    expect(await ports.web_fetch!({ url: "https://example.com" }, context(controller.signal))).toMatchObject({ failure: { code: "WEB_FETCH_CANCELLED" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
