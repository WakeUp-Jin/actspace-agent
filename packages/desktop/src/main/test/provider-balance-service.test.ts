import { describe, expect, it, vi } from "vitest";
import { ProviderProxyError, type ProviderFetch, type ProviderRuntimeConfig } from "@actspace/agent-core";
import { getDeepSeekBalanceSnapshot, getKimiBalanceSnapshot } from "../provider-balance-service";

const NOW = new Date("2026-07-25T08:00:00.000Z");

function runtime(provider: "deepseek" | "kimi"): ProviderRuntimeConfig {
  return {
    provider,
    apiKey: `test-${provider}-key`,
    baseUrl: provider === "deepseek" ? "https://api.deepseek.com/anthropic" : "https://api.moonshot.cn/v1",
  };
}

describe("provider balance service", () => {
  it("returns an unconfigured snapshot without making a request", async () => {
    expect(await getDeepSeekBalanceSnapshot(undefined, { now: () => NOW })).toEqual({
      provider: "deepseek",
      isConfigured: false,
      isAvailable: null,
      generatedAt: NOW.toISOString(),
      displayBalance: null,
    });
  });

  it("uses the explicit DeepSeek runtime and its provider-scoped proxy", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [
        { currency: "USD", total_balance: "1" },
        { currency: "CNY", total_balance: "12.345" },
      ],
    }), { status: 200 })) as unknown as ProviderFetch;
    const createFetch = vi.fn(() => fetchImpl);
    const result = await getDeepSeekBalanceSnapshot({
      ...runtime("deepseek"),
      transport: { proxyUrl: "http://127.0.0.1:7890" },
    }, { createFetch, now: () => NOW });

    expect(createFetch).toHaveBeenCalledWith("http://127.0.0.1:7890");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.deepseek.com/user/balance", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-deepseek-key" }),
    }));
    expect(result).toMatchObject({ isConfigured: true, isAvailable: true, displayBalance: { amount: "12.35", currency: "CNY" } });
    expect(JSON.stringify(result)).not.toContain("test-deepseek-key");
  });

  it("loads Kimi balance from the runtime base URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: true,
      data: { available_balance: 8.5 },
    }), { status: 200 })) as unknown as ProviderFetch;
    const result = await getKimiBalanceSnapshot(runtime("kimi"), { directFetch: fetchImpl, now: () => NOW });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.moonshot.cn/v1/users/me/balance", expect.any(Object));
    expect(result).toMatchObject({ isConfigured: true, isAvailable: true, displayBalance: { amount: "8.50", currency: "CNY" } });
  });

  it("sanitizes proxy failures", async () => {
    await expect(getKimiBalanceSnapshot({
      ...runtime("kimi"),
      transport: { proxyUrl: "http://127.0.0.1:7890" },
    }, {
      createFetch: () => async () => { throw new ProviderProxyError({ cause: new Error("http://private-proxy") }); },
      now: () => NOW,
    })).rejects.toThrow("kimi balance proxy connection failed");
  });
});
