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

it("loads the production proxy dependency without a mock", async () => {
  const pool = new ProviderProxyPool();
  try { expect(await pool.getFetch("http://127.0.0.1:9")).toBeTypeOf("function"); }
  finally { await pool.dispose(); }
});

it("classifies dependency initialization failures as proxy errors without exposing internals", async () => {
  const pool = new ProviderProxyPool(async () => { throw new Error("missing private module path"); });
  await expect(pool.getFetch("http://127.0.0.1:9")).rejects.toMatchObject({ name: "ProviderProxyError", message: "Provider proxy connection failed." });
});
