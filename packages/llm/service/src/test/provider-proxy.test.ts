import { describe, expect, it } from "vitest";
import { normalizeProviderProxyUrl, ProviderProxyPool } from "../provider-proxy.js";

describe("ProviderProxyPool", () => {
  it("normalizes a scoped proxy URL and reuses one dispatcher", async () => {
    const closed: string[] = [];
    const loaded: string[] = [];
    const pool = new ProviderProxyPool(async () => ({
      ProxyAgent: class {
        constructor(readonly url: string) { loaded.push(url); }
        async close(): Promise<void> { closed.push(this.url); }
      },
      fetch: async () => new Response("ok"),
    }));

    const first = await pool.getFetch("http://proxy.example:8080/path?secret=1#fragment");
    const second = await pool.getFetch("http://proxy.example:8080/");

    expect(first).toBe(second);
    expect(loaded).toEqual(["http://proxy.example:8080/"]);
    await pool.dispose();
    expect(closed).toEqual(["http://proxy.example:8080/"]);
  });

  it("rejects credentials and non-http proxy schemes", () => {
    expect(() => normalizeProviderProxyUrl("http://user:pass@proxy.example")).toThrow("proxy");
    expect(() => normalizeProviderProxyUrl("socks5://proxy.example")).toThrow("proxy");
  });
});
