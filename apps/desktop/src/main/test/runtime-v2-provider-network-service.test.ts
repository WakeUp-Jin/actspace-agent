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

  it("falls back to Bearer for the 1-token test only when auth is still unresolved", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(null, { status: headersOf(init).has("x-api-key") ? 403 : 200 }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    await expect(service.testCustomConnection({ ...anthropicDraft, model: "claude-sonnet-5" })).resolves.toMatchObject({ ok: true, resolvedAuth: "bearer" });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockClear();
    await expect(service.testCustomConnection({ ...anthropicDraft, model: "claude-sonnet-5", resolvedAuth: "x-api-key" })).resolves.toMatchObject({ ok: false, errorKind: "auth" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    const result = await service.testCustomConnection({ ...anthropicDraft, model: "claude-sonnet-5", authMode: "x-api-key" });
    expect(result).toMatchObject({ ok: false, errorKind: "auth" });
    expect(result.message).not.toContain(KEY);
    expect(result).not.toHaveProperty("resolvedAuth");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["openai-completions", "https://relay.example/v1/chat/completions", "Authorization", "Bearer secret-provider-key", "max_tokens"],
    ["openai-responses", "https://relay.example/v1/responses", "Authorization", "Bearer secret-provider-key", "max_output_tokens"],
    ["anthropic-messages", "https://relay.example/v1/messages", "x-api-key", "secret-provider-key", "max_tokens"],
  ] as const)("sends an explicit minimal %s model test", async (protocol, expectedUrl, headerName, headerValue, tokenField) => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });
    await expect(service.testCustomConnection({ protocol, apiKey: "secret-provider-key", baseUrl: "https://relay.example/v1".replace(/\/v1$/, protocol === "anthropic-messages" ? "" : "/v1"), model: "vendor/model" })).resolves.toMatchObject({ ok: true, checkedAt: NOW.toISOString() });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(expectedUrl);
    expect(init).toMatchObject({ method: "POST" });
    expect(new Headers(init?.headers).get(headerName)).toBe(headerValue);
    if (protocol === "anthropic-messages") expect(new Headers(init?.headers).get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "vendor/model", [tokenField]: 1 });
    expect(body).not.toHaveProperty("tools");
    expect(JSON.stringify(body)).not.toContain("cache_control");
  });

  it.each([
    ["deepseek", "https://api.deepseek.com/user/balance"],
    ["kimi", "https://api.moonshot.cn/v1/models"],
    ["openrouter", "https://openrouter.ai/api/v1/models"],
  ] as const)("probes %s without sending a prompt", async (provider, expectedUrl) => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const service = new ProviderNetworkService({ directFetch: fetch, now: () => NOW });

    await expect(service.testConnection(runtime(provider))).resolves.toEqual({ ok: true, message: "Connection succeeded.", checkedAt: NOW.toISOString() });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(expectedUrl);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("classifies status and proxy failures without exposing upstream details", async () => {
    const denied = new ProviderNetworkService({ directFetch: async () => new Response("private body", { status: 401 }), now: () => NOW });
    await expect(denied.testConnection(runtime("openrouter"))).resolves.toMatchObject({ ok: false, errorKind: "auth", statusCode: 401 });

    const proxy = new ProviderNetworkService({
      proxyFetch: async () => async () => {
        const error = new Error("proxy http://user:secret@private.invalid");
        error.name = "ProviderProxyError";
        throw error;
      },
      now: () => NOW,
    });
    const result = await proxy.testConnection({ ...runtime("openrouter"), transport: { proxyUrl: "http://127.0.0.1:7897" } });
    expect(result).toMatchObject({ ok: false, errorKind: "proxy", message: "Provider proxy connection failed." });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("127.0.0.1");
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

it("uses the DeepSeek connection and scoped proxy for model discovery, with sanitized failures", async () => {
  const directFetch = vi.fn(async () => Response.json({ data: [{ id: "deepseek-flash" }] }));
  const proxyRequest = vi.fn(async () => new Response("secret-upstream", { status: 401 }));
  const proxyFetch = vi.fn(async () => proxyRequest);
  const service = new ProviderNetworkService({ directFetch, proxyFetch });
  expect(await service.fetchModelCatalog(runtime("deepseek"))).toMatchObject({ ok: true, payload: { data: [{ id: "deepseek-flash" }] } });
  expect(directFetch.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/models");
  const failure = await service.fetchModelCatalog({ ...runtime("deepseek"), transport: { proxyUrl: "http://localhost:7890" } });
  expect(proxyFetch).toHaveBeenCalledWith("http://localhost:7890");
  expect(failure).toMatchObject({ ok: false, code: "auth" });
  expect(JSON.stringify(failure)).not.toContain("secret-upstream");
  expect(directFetch).toHaveBeenCalledTimes(1);
  await service.dispose();
});

it("uses the configured Kimi-compatible /models endpoint for model discovery", async () => {
  const directFetch = vi.fn(async () => Response.json({
    data: [
      { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", context_length: 256_000, max_output_tokens: 32_768, input_modalities: ["text", "image"], supports_reasoning: true },
    ],
  }));
  const service = new ProviderNetworkService({ directFetch, now: () => NOW });

  await expect(service.fetchModelCatalog({ ...runtime("kimi"), baseUrl: "https://api.moonshot.ai/v1" })).resolves.toMatchObject({
    ok: true,
    payload: { data: [expect.objectContaining({ id: "kimi-k2-thinking" })] },
  });
  expect(directFetch).toHaveBeenCalledWith("https://api.moonshot.ai/v1/models", expect.objectContaining({ method: "GET" }));
  await service.dispose();
});
