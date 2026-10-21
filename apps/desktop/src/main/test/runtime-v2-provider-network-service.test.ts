import { describe, expect, it, vi } from "vitest";
import { ProviderNetworkService, type ProviderNetworkRuntime } from "../runtime-v2/provider-network-service";

const NOW = new Date("2026-08-23T06:00:00.000Z");

describe("ProviderNetworkService", () => {
  const KEY = "test-provider-key";
  const anthropicDraft = { protocol: "anthropic-messages" as const, apiKey: KEY, baseUrl: "https://relay.example", model: "", authMode: "auto" as const };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const headersOf = (init?: RequestInit) => new Headers(init?.headers);

  it("falls back from x-api-key to Bearer on 401 and remembers Bearer", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => headersOf(init).has("x-api-key")
      ? json({ error: "bad key" }, 401)
      : json({ data: [{ id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }, { id: "claude-sonnet-5" }, { id: "claude-opus-5" }], has_more: false }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    const result = await service.probeCustomConnection(anthropicDraft);
    expect(result).toMatchObject({ ok: true, resolvedAuth: "bearer", models: [{ id: "claude-sonnet-5", label: "Claude Sonnet 5" }, { id: "claude-opus-5" }] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).toBe("https://relay.example/v1/models?limit=1000");
    const second = headersOf(fetch.mock.calls[1]![1]);
    expect(second.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(second.has("x-api-key")).toBe(false);
    expect(second.get("anthropic-version")).toBe("2023-06-01");
    expect(result.message).not.toContain(KEY);
  });

  it("reports an auth failure when both schemes are rejected", async () => {
    const fetch = vi.fn(async () => json({ error: `invalid ${KEY}` }, 401));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    const result = await service.probeCustomConnection(anthropicDraft);
    expect(result).toMatchObject({ ok: false, errorKind: "auth", statusCode: 401, models: null });
    expect(result).not.toHaveProperty("resolvedAuth");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("treats a missing model list as reachable without resolving auth", async () => {
    const fetch = vi.fn(async () => new Response("not found", { status: 404 }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    const result = await service.probeCustomConnection(anthropicDraft);
    expect(result).toMatchObject({ ok: true, models: null, statusCode: 404 });
    expect(result).not.toHaveProperty("resolvedAuth");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("merges paged Anthropic model lists", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => String(url).includes("after_id=m2")
      ? json({ data: [{ id: "m3" }], has_more: false, last_id: "m3" })
      : json({ data: [{ id: "m1" }, { id: "m2" }], has_more: true, last_id: "m2" }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    const result = await service.probeCustomConnection({ ...anthropicDraft, authMode: "x-api-key" });
    expect(result.models?.map((model) => model.id)).toEqual(["m1", "m2", "m3"]);
    expect(result).not.toHaveProperty("resolvedAuth");
    expect(fetch.mock.calls[1]![0]).toBe("https://relay.example/v1/models?limit=1000&after_id=m2");
  });

  it("lists OpenAI-compatible models with Bearer only and never falls back", async () => {
    const fetch = vi.fn(async () => json({ data: [{ id: "gpt-5" }] }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    const result = await service.probeCustomConnection({ protocol: "openai-completions", apiKey: KEY, baseUrl: "https://relay.example/v1", model: "", authMode: "auto" });
    expect(result).toMatchObject({ ok: true, models: [{ id: "gpt-5" }] });
    expect(result).not.toHaveProperty("resolvedAuth");
    expect(fetch.mock.calls[0]![0]).toBe("https://relay.example/v1/models");
    expect(headersOf(fetch.mock.calls[0]![1]).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headersOf(fetch.mock.calls[0]![1]).has("x-api-key")).toBe(false);
  });

  it.each([
    ["deepseek", { is_available: true, balance_infos: [{ currency: "CNY", total_balance: "12.345" }] }, { amount: "12.35", currency: "CNY" }],
    ["kimi", { status: true, data: { available_balance: 8 } }, { amount: "8.00", currency: "CNY" }],
    ["openrouter", { data: { total_credits: 20, total_usage: 3.5 } }, { amount: "16.50", currency: "USD" }],
  ] as const)("normalizes %s balance", async (provider, payload, displayBalance) => {
    const service = new ProviderNetworkService({ directFetch: async () => Response.json(payload), now: () => NOW });
    await expect(service.getBalance(provider, runtime(provider))).resolves.toMatchObject({ provider, isConfigured: true, generatedAt: NOW.toISOString(), displayBalance });
  });
});

function runtime(provider: ProviderNetworkRuntime["provider"]): ProviderNetworkRuntime {
  return {
    provider,
    apiKey: "secret-provider-key",
    baseUrl: provider === "deepseek"
      ? "https://api.deepseek.com"
      : provider === "kimi"
        ? "https://api.moonshot.cn/v1"
        : "https://openrouter.ai/api/v1",
  };
}
