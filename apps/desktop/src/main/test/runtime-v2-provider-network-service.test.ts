import { describe, expect, it, vi } from "vitest";
import { ProviderNetworkService, type ProviderNetworkRuntime } from "../runtime-v2/provider-network-service";

const NOW = new Date("2026-08-23T06:00:00.000Z");

describe("ProviderNetworkService", () => {
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
