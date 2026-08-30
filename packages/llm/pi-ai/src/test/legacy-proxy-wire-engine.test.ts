import { describe, expect, it } from "vitest";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import type { LlmStreamEvent } from "@actspace/llm-service";
import { LegacyProxyWireEngine, type LegacyProxySdkLoader } from "../legacy-proxy-wire-engine.js";
import { ProviderProxyError, ProviderProxyPool } from "@actspace/llm-service";
import type { PiAiWireRoute } from "../pi-ai-wire-engine.js";

const routes: readonly PiAiWireRoute[] = ["openai-completions", "openai-responses", "anthropic-messages"];

describe("LegacyProxyWireEngine", () => {
  it.each(routes)("maps the scoped proxy stream for %s", async (route) => {
    const observed: { params?: unknown; options?: unknown } = {};
    const pool = new ProviderProxyPool(async () => ({
      ProxyAgent: class { async close(): Promise<void> {} },
      fetch: async () => new Response("ok"),
    }));
    const engine = new LegacyProxyWireEngine({
      route,
      providerId: "fixture-provider",
      modelId: "fixture-model",
      baseUrl: "https://provider.example/v1",
      proxies: pool,
      loadSdk: loaderFor(route, observed),
    });

    const events: LlmStreamEvent[] = [];
    for await (const event of await engine.stream(input(route))) events.push(event);

    expect(events.some((event) => event.type === "text-delta" && event.text === "answer")).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
    expect(observed.params).toBeDefined();
    const serialized = JSON.stringify(observed.params);
    expect(serialized).toContain("read_file");
    expect(serialized).not.toContain("plugin.test/read_file");
    expect(observed.options).toMatchObject({ signal: expect.any(AbortSignal) });
    await pool.dispose();
  });

  it.each(routes)("rejects a truncated %s stream without publishing done", async (route) => {
    const pool = proxyPool();
    const engine = new LegacyProxyWireEngine({
      route,
      providerId: "fixture-provider",
      modelId: "fixture-model",
      baseUrl: "https://provider.example/v1",
      proxies: pool,
      loadSdk: loaderFor(route, {}, truncatedEvents(route)),
    });

    const events: LlmStreamEvent[] = [];
    for await (const event of await engine.stream(input(route))) events.push(event);

    expect(events.some((event) => event.type === "text-delta" && event.text === "partial")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      failure: { kind: "malformed-stream", retryable: true },
    });
    await pool.dispose();
  });

  it("classifies a request-scoped proxy disconnect without leaking its cause", async () => {
    const pool = proxyPool();
    const engine = new LegacyProxyWireEngine({
      route: "openai-completions",
      providerId: "fixture-provider",
      modelId: "fixture-model",
      baseUrl: "https://provider.example/v1",
      proxies: pool,
      loadSdk: loaderFor("openai-completions", {}, proxyDisconnectEvents()),
    });

    const events: LlmStreamEvent[] = [];
    for await (const event of await engine.stream(input("openai-completions"))) events.push(event);

    expect(events.at(-1)).toEqual({
      type: "error",
      failure: {
        kind: "proxy",
        message: "Provider proxy connection failed.",
        retryable: true,
        attempt: 1,
      },
    });
    await pool.dispose();
  });
});

function proxyPool(): ProviderProxyPool {
  return new ProviderProxyPool(async () => ({
    ProxyAgent: class { async close(): Promise<void> {} },
    fetch: async () => new Response("ok"),
  }));
}

function input(route: PiAiWireRoute): LlmAdapterDispatchInput {
  return {
    request: {
      requestId: `request-${route}`,
      sessionId: "session-1",
      routeId: route,
      model: "request-model",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "question" },
        { role: "assistant", content: [{ type: "tool-call", callId: "call-1", name: "read_file", arguments: "{}" }] },
        { role: "tool", callId: "call-1", content: "result" },
      ],
      tools: [{ name: "read_file", definitionVersion: 1, definitionDigest: "digest", description: "Read", inputSchema: { type: "object" } }],
      options: { maxTokens: 128 },
      credentialRef: "credential",
    },
    credential: { apiKey: "secret", proxyUrl: "http://proxy.example:8080" },
    signal: new AbortController().signal,
  };
}

function loaderFor(
  route: PiAiWireRoute,
  observed: { params?: unknown; options?: unknown },
  events: AsyncIterable<Record<string, unknown>> | undefined = undefined,
): LegacyProxySdkLoader {
  if (route === "anthropic-messages") {
    class AnthropicClient {
      readonly messages = {
        stream: (params: unknown, options: unknown) => {
          observed.params = params;
          observed.options = options;
          return events ?? anthropicEvents();
        },
      };
    }
    return async () => AnthropicClient as never;
  }
  if (route === "openai-responses") {
    class ResponsesClient {
      readonly responses = {
        create: async (params: unknown, options: unknown) => {
          observed.params = params;
          observed.options = options;
          return events ?? responsesEvents();
        },
      };
    }
    return async () => ResponsesClient as never;
  }
  class CompletionsClient {
    readonly chat = {
      completions: {
        create: async (params: unknown, options: unknown) => {
          observed.params = params;
          observed.options = options;
          return events ?? completionsEvents();
        },
      },
    };
  }
  return async () => CompletionsClient as never;
}

function truncatedEvents(route: PiAiWireRoute): AsyncIterable<Record<string, unknown>> {
  if (route === "openai-responses") return oneEvent({ type: "response.output_text.delta", delta: "partial" });
  if (route === "anthropic-messages") return oneEvent({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } });
  return oneEvent({ choices: [{ delta: { content: "partial" }, finish_reason: null }] });
}

async function* oneEvent(event: Record<string, unknown>): AsyncIterable<Record<string, unknown>> {
  yield event;
}

async function* proxyDisconnectEvents(): AsyncIterable<Record<string, unknown>> {
  yield { choices: [{ delta: { content: "partial" }, finish_reason: null }] };
  throw new ProviderProxyError({ cause: new Error("http://user:secret@proxy.invalid disconnected") });
}

async function* completionsEvents(): AsyncIterable<Record<string, unknown>> {
  yield { choices: [{ delta: { content: "answer" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 3 } };
}

async function* responsesEvents(): AsyncIterable<Record<string, unknown>> {
  yield { type: "response.output_text.delta", delta: "answer" };
  yield { type: "response.completed", response: { status: "completed", usage: { input_tokens: 2, output_tokens: 3 } } };
}

async function* anthropicEvents(): AsyncIterable<Record<string, unknown>> {
  yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "answer" } };
  yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } };
}
