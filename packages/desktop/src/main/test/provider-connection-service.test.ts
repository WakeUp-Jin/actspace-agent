import { describe, expect, it, vi } from "vitest";
import { ProviderProxyError, type ProviderFetch, type ProviderRuntimeConfig } from "@actspace/agent-core";
import { testProviderConnection } from "../provider-connection-service";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function runtime(provider: ProviderRuntimeConfig["provider"]): ProviderRuntimeConfig {
  return {
    provider,
    apiKey: "sk-test-secret",
    baseUrl: provider === "deepseek"
      ? "https://api.deepseek.com/anthropic"
      : provider === "kimi"
        ? "https://api.moonshot.cn/v1"
        : "https://openrouter.ai/api/v1",
  };
}

function options(fetchImpl: ProviderFetch) {
  return { directFetch: fetchImpl, timeoutMs: 20, now: () => NOW };
}

describe("provider connection service", () => {
  it.each([
    ["deepseek", "https://api.deepseek.com/user/balance"],
    ["kimi", "https://api.moonshot.cn/v1/models"],
    ["openrouter", "https://openrouter.ai/api/v1/models"],
  ] as const)("uses the lightweight %s health endpoint without sending a prompt", async (provider, expectedUrl) => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as ProviderFetch;
    const result = await testProviderConnection(runtime(provider), options(fetchImpl));

    expect(result).toEqual({ ok: true, message: "连接成功，API Key 有效。", checkedAt: NOW.toISOString() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe(expectedUrl);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer sk-test-secret");
    if (provider === "openrouter") expect(init.headers["X-OpenRouter-Title"]).toBe("Actspace");
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [402, "insufficient_balance"],
    [429, "rate_limit"],
    [500, "server"],
    [400, "invalid_request"],
    [404, "invalid_request"],
  ] as const)("maps HTTP %s to %s without reading the response body", async (status, errorKind) => {
    let bodyRead = false;
    const response = new Response("private upstream error", { status });
    Object.defineProperty(response, "text", { value: () => { bodyRead = true; return Promise.resolve("private"); } });
    const result = await testProviderConnection(runtime("openrouter"), options(async () => response));

    expect(result.ok).toBe(false);
    expect(result.errorKind).toBe(errorKind);
    expect(result.statusCode).toBe(status);
    expect(result.message).not.toContain("private");
    expect(bodyRead).toBe(false);
  });

  it("maps provider proxy failures without exposing the proxy URL", async () => {
    const result = await testProviderConnection(
      { ...runtime("openrouter"), transport: { proxyUrl: "http://127.0.0.1:7890" } },
      {
        createFetch: (proxyUrl) => {
          expect(proxyUrl).toBe("http://127.0.0.1:7890");
          return async () => {
            throw new ProviderProxyError({ cause: new Error("connect http://secret-proxy") });
          };
        },
        timeoutMs: 20,
        now: () => NOW,
      },
    );

    expect(result.errorKind).toBe("proxy");
    expect(result.message).not.toContain("127.0.0.1");
    expect(result.message).not.toContain("secret-proxy");
  });

  it("distinguishes direct network errors from timeouts", async () => {
    const network = await testProviderConnection(runtime("kimi"), options(async () => {
      throw new Error("ECONNRESET private-host");
    }));
    expect(network.errorKind).toBe("network");
    expect(network.message).not.toContain("private-host");

    const timeoutFetch: ProviderFetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
    const timeout = await testProviderConnection(runtime("kimi"), {
      ...options(timeoutFetch),
      timeoutMs: 1,
    });
    expect(timeout.errorKind).toBe("timeout");
  });
});
