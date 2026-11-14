import { afterEach, expect, it, vi } from "vitest";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { LlmAdapterDispatchInput, LlmMessage, LlmRequestOptions } from "@actspace/llm-service";
import { ProviderProxyPool } from "@actspace/llm-service";
import {
  BUILTIN_PROVIDER_BY_BASE_URL,
  builtinProviderForBaseUrl,
  normalizeBuiltinBaseUrl,
} from "../builtin-providers.js";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import type { PiAiConnectionOptions } from "../pi-ai-stream.js";

type Seen = { readonly url: string; readonly headers: Headers; readonly body: Record<string, unknown> };

afterEach(() => vi.unstubAllGlobals());

function capture(): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ error: { message: "fixture" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return seen;
}

function request(
  model: string,
  options: LlmRequestOptions = {},
  messages: readonly LlmMessage[] = [{ role: "user", content: "hi" }],
): LlmAdapterDispatchInput {
  return {
    request: {
      requestId: "r",
      sessionId: "session-1",
      routeId: "route",
      model,
      messages,
      tools: [],
      options: { maxTokens: 16, ...options },
    },
    credential: { apiKey: "fixture" },
    signal: new AbortController().signal,
  } as unknown as LlmAdapterDispatchInput;
}

async function send(wire: PiAiConnectionOptions, input: LlmAdapterDispatchInput) {
  const events = [];
  for await (const event of await new PiAiAdapter({ wire }).dispatch(input)) events.push(event);
  return events;
}

it("keeps the Base URL table equal to the pinned pi-ai built-in providers", () => {
  const owners = new Map<string, Set<string>>();
  for (const provider of builtinProviders())
    for (const model of provider.getModels()) {
      if (
        !["openai-completions", "openai-responses", "anthropic-messages"].includes(model.api) ||
        !model.baseUrl ||
        model.baseUrl.includes("{")
      )
        continue;
      const url = normalizeBuiltinBaseUrl(model.baseUrl)!;
      owners.set(url, (owners.get(url) ?? new Set()).add(provider.id));
    }
  const expected = Object.fromEntries(
    [...owners]
      .filter(([, ids]) => ids.size === 1)
      .map(([url, ids]) => [url, [...ids][0]])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  expect({ ...BUILTIN_PROVIDER_BY_BASE_URL }).toEqual(expected);
});

it.each([
  ["https://api.deepseek.com/", "deepseek"],
  ["https://api.moonshot.cn/v1", "moonshotai-cn"],
  ["https://api.moonshot.ai/v1", "moonshotai"],
  ["https://api.xiaomimimo.com/v1", "xiaomi"],
  ["https://openrouter.ai/api/v1", "openrouter"],
  ["https://api.z.ai/api/paas/v4", undefined],
  ["https://api.minimax.io/v1", undefined],
  ["https://ark.cn-beijing.volces.com/api/coding/v3", undefined],
  ["https://relay.example/v1", undefined],
])("matches %s only on an exact built-in address", (url, provider) => {
  expect(builtinProviderForBaseUrl(url)).toBe(provider);
});

it("lets the built-in DeepSeek model own thinking fields and the token field", async () => {
  const seen = capture();
  await send(
    { route: "openai-completions", providerId: "deepseek", baseUrl: "https://api.deepseek.com" },
    request("deepseek-flash", { reasoning: true, reasoningEffort: "medium" }),
  );
  expect(seen).toHaveLength(1);
  // deepseek-flash maps medium to nothing; pi-ai rounds up to the next supported level.
  expect(seen[0].body).toMatchObject({
    model: "deepseek-flash",
    thinking: { type: "enabled" },
    reasoning_effort: "high",
    max_tokens: 16,
  });
  expect(seen[0].body).not.toHaveProperty("max_completion_tokens");
});

it("disables DeepSeek thinking through pi-ai when reasoning is off", async () => {
  const seen = capture();
  await send(
    { route: "openai-completions", providerId: "deepseek", baseUrl: "https://api.deepseek.com" },
    request("deepseek-flash", { reasoning: false }),
  );
  expect(seen[0].body).toMatchObject({ thinking: { type: "disabled" } });
  expect(seen[0].body).not.toHaveProperty("reasoning_effort");
});

it("sends no thinking fields on a built-in route when the user left reasoning on auto", async () => {
  const seen = capture();
  await send(
    { route: "openai-completions", providerId: "deepseek", baseUrl: "https://api.deepseek.com" },
    request("deepseek-flash"),
  );
  expect(seen[0].body).not.toHaveProperty("thinking");
  expect(seen[0].body).not.toHaveProperty("reasoning_effort");
});

it("borrows the built-in implementation for an id pi-ai does not know", async () => {
  const seen = capture();
  await send(
    {
      route: "openai-completions",
      providerId: "kimi",
      baseUrl: "https://api.moonshot.cn/v1",
      modelFacts: { contextWindow: 128_000, maxTokens: 8_192, input: ["text"], reasoning: true },
    },
    request("kimi-next-preview", { reasoning: true, reasoningEffort: "high" }),
  );
  expect(seen[0].url).toBe("https://api.moonshot.cn/v1/chat/completions");
  // pi-ai detects Moonshot by address (max_tokens); thinking keeps ActSpace's Kimi rule since pi-ai has no map for this id.
  expect(seen[0].body).toMatchObject({ model: "kimi-next-preview", thinking: { type: "enabled" }, max_tokens: 16 });
  expect(seen[0].body).not.toHaveProperty("reasoning_effort");
});

it("keeps the custom relay thinking rewrite off built-in addresses", async () => {
  const seen = capture();
  await send(
    { route: "openai-completions", providerId: "custom", baseUrl: "https://relay.example/v1" },
    request("vendor/model", { reasoning: true, reasoningEffort: "high" }),
  );
  expect(seen[0].body).toMatchObject({ reasoning_effort: "high" });
});

it("routes each OpenCode Go model to its own protocol and adds the session header", async () => {
  const seen = capture();
  const wire = {
    route: "openai-completions",
    providerId: "custom",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
  } as const;
  await send(wire, request("glm-5.3"));
  await send(wire, request("gpt-6-luna"));
  await send(wire, request("claude-haiku-5-5"));
  expect(seen.map((entry) => entry.url)).toEqual([
    "https://opencode.ai/inference/go/openai/v1/chat/completions",
    "https://opencode.ai/inference/go/openai/v1/responses",
    "https://opencode.ai/inference/go/anthropic/v1/messages?beta=true",
  ]);
  for (const entry of seen) expect(entry.headers.get("x-opencode-session")).toBe("session-1");
});

it("keeps ActSpace capacity facts over the built-in model's", async () => {
  const seen = capture();
  await send(
    {
      route: "anthropic-messages",
      providerId: "anthropic",
      baseUrl: "https://api.anthropic.com",
      modelFacts: { contextWindow: 200_000, maxTokens: 4_096, input: ["text"], reasoning: true },
    },
    request("claude-sonnet-5", { maxTokens: undefined }),
  );
  expect(seen[0].body).toMatchObject({ model: "claude-sonnet-5", max_tokens: 4_096 });
});

it("keeps same-model reasoning signatures when the history replays to a built-in provider", async () => {
  const seen = capture();
  const history: LlmMessage[] = [
    { role: "user", content: "hi" },
    {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "thought",
          replay: {
            schemaVersion: 1,
            adapterFamily: "pi-ai",
            providerId: "anthropic",
            protocol: "anthropic-messages",
            modelId: "claude-sonnet-5",
            payload: { thinkingSignature: "sig-1" },
          },
        },
        { type: "text", text: "hello" },
      ],
    },
    { role: "user", content: "again" },
  ];
  await send(
    { route: "anthropic-messages", providerId: "anthropic", baseUrl: "https://api.anthropic.com" },
    request("claude-sonnet-5", { reasoning: true, reasoningEffort: "high" }, history),
  );
  const assistant = (
    seen[0].body.messages as Array<{ role: string; content: Array<{ type: string; signature?: string }> }>
  ).find((message) => message.role === "assistant")!;
  expect(assistant.content[0]).toMatchObject({ type: "thinking", signature: "sig-1" });
});

it("sends a proxied pi-ai request through the request-scoped fetch only", async () => {
  const direct = capture();
  const proxied: string[] = [];
  const pool = new ProviderProxyPool(
    async () =>
      ({
        ProxyAgent: class {
          async close() {}
        },
        fetch: async (url: unknown) => {
          proxied.push(String(url));
          return new Response(JSON.stringify({ error: { message: "fixture" } }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        },
      }) as never,
  );
  const input = request("deepseek-flash");
  const events = await send(
    { route: "openai-completions", providerId: "deepseek", baseUrl: "https://api.deepseek.com", proxies: pool },
    { ...input, credential: { ...input.credential, proxyUrl: "http://127.0.0.1:7890" } },
  );
  expect(proxied).toEqual(["https://api.deepseek.com/chat/completions"]);
  expect(direct).toHaveLength(0);
  expect(events.at(-1)).toMatchObject({ type: "error", failure: { kind: "invalid-request" } });
  await pool.dispose();
});

it("classifies a proxy connection failure on the pi-ai path as proxy", async () => {
  capture();
  const pool = new ProviderProxyPool(
    async () =>
      ({
        ProxyAgent: class {
          async close() {}
        },
        fetch: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }) as never,
  );
  const input = request("vendor/model");
  const events = await send(
    { route: "openai-completions", providerId: "custom", baseUrl: "https://relay.example/v1", proxies: pool },
    { ...input, credential: { ...input.credential, proxyUrl: "http://127.0.0.1:7890" } },
  );
  expect(events.at(-1)).toMatchObject({ type: "error", failure: { kind: "proxy", retryable: true } });
  await pool.dispose();
});

it("does not let a built-in model fall back to another model server-side", async () => {
  const seen = capture();
  await send(
    { route: "anthropic-messages", providerId: "anthropic", baseUrl: "https://api.anthropic.com" },
    request("claude-fable-5"),
  );
  expect(seen[0].body).toMatchObject({ model: "claude-fable-5" });
  expect(seen[0].body).not.toHaveProperty("fallbacks");
});
