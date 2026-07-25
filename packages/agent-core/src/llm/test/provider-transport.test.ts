import { afterEach, describe, expect, it } from "vitest";
import {
  closeProviderTransports,
  createProviderFetch,
  normalizeProxyUrl,
  ProviderProxyError,
} from "../provider-transport";
import { OpenAICompletionsService } from "../services/openai-completions";
import { AnthropicMessagesService } from "../services/anthropic-messages";

const context = {
  messages: [{ role: "user" as const, content: "hello", timestamp: Date.now() }],
};

describe("provider transport", () => {
  afterEach(async () => {
    await closeProviderTransports();
  });

  it("keeps direct requests on the SDK default fetch", () => {
    expect(createProviderFetch()).toBeUndefined();
    expect(createProviderFetch("  ")).toBeUndefined();
  });

  it("reuses one proxy transport per normalized URL and isolates different URLs", async () => {
    const first = createProviderFetch("http://127.0.0.1:7890");
    const same = createProviderFetch("http://127.0.0.1:7890/");
    const different = createProviderFetch("http://127.0.0.1:7891");

    expect(first).toBe(same);
    expect(first).not.toBe(different);

    await closeProviderTransports();
    expect(createProviderFetch("http://127.0.0.1:7890")).not.toBe(first);
  });

  it("normalizes harmless URL variations", () => {
    expect(normalizeProxyUrl(" HTTP://127.0.0.1:7890/path?ignored=1#hash ")).toBe(
      "http://127.0.0.1:7890/",
    );
  });

  it.each([
    "socks5://127.0.0.1:1080",
    "http://user:secret@127.0.0.1:7890",
    "not a url",
  ])("rejects unsafe proxy URL %s without echoing it", (proxyUrl) => {
    expect(() => createProviderFetch(proxyUrl)).toThrow(ProviderProxyError);
    try {
      createProviderFetch(proxyUrl);
    } catch (error) {
      expect(String(error)).not.toContain(proxyUrl);
      expect(String(error)).not.toContain("secret");
    }
  });

  it("injects a proxy fetch only into the scoped service config", () => {
    const direct = new OpenAICompletionsService({
      provider: "kimi",
      apiKey: "sk-test",
      model: "kimi-k2.6",
    });
    const proxied = new OpenAICompletionsService({
      provider: "openrouter",
      apiKey: "sk-test",
      model: "anthropic/claude-sonnet-4",
      transport: { proxyUrl: "http://127.0.0.1:7890" },
    });

    expect((direct as any).client._options.fetch).toBeUndefined();
    expect((proxied as any).client._options.fetch).toBeTypeOf("function");
  });

  it.each([
    ["openai", OpenAICompletionsService, "openrouter", "anthropic/claude-sonnet-4"],
    ["anthropic", AnthropicMessagesService, "deepseek", "deepseek-v4-pro"],
  ] as const)("maps nested %s SDK transport failures to a sanitized proxy error", async (
    _protocol,
    Service,
    provider,
    model,
  ) => {
    const failingFetch = async () => {
      throw new ProviderProxyError({ cause: new Error("connect ECONNREFUSED http://secret-proxy") });
    };
    const service = new Service({
      provider,
      apiKey: "sk-test",
      model,
      maxRetries: 0,
      transport: { fetch: failingFetch },
    } as any);

    const result = await service.complete(context);

    expect(result.stopReason).toBe("error");
    expect(result.errorKind).toBe("proxy");
    expect(result.errorMessage).not.toContain("secret-proxy");
  });
});
