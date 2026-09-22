import { expect, it } from "vitest";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";

it.each([true, false])("carries thinking and effort through direct transport (enabled=%s)", async (enabled) => {
  let payload: unknown;
  let streamOptions: Record<string, unknown> = {};
  const engine = new PiAiAdapter({ wire: { route: "openai-completions", providerId: "deepseek", baseUrl: "https://example.test", load: async () => ({
    core: {
      createProvider: () => ({ id: "deepseek" }),
      createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "v4", provider: "deepseek" }), streamSimple: (_model, _context, options) => {
        streamOptions = options as Record<string, unknown>;
        payload = (streamOptions.onPayload as (body: object) => object)({ model: "v4" });
        return (async function* () { yield { type: "done", message: { content: [], stopReason: "stop" } }; })();
      } }),
    }, api: { stream: () => {}, streamSimple: () => {} },
  }) } });
  const input = { request: { requestId: "r", sessionId: "s", routeId: "deepseek", model: "v4", messages: [], tools: [], options: { reasoning: enabled, reasoningEffort: "max" } }, credential: { apiKey: "fixture" }, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput;
  for await (const _event of await engine.dispatch(input)) { /* drain */ }
  expect(payload).toMatchObject({ thinking: { type: enabled ? "enabled" : "disabled" } });
  if (enabled) expect(payload).toMatchObject({ reasoning_effort: "max" });
  else expect(streamOptions.reasoning).toBeUndefined();
});

it("ignores the SDK zero-price cost and freezes an estimated price for the request", async () => {
  const { calculateCost } = await import("@earendil-works/pi-ai");
  const usage = { input: 1000, output: 500, cacheRead: 2000, cacheWrite: 0, totalTokens: 3500, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  calculateCost({ cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } as never, usage);
  expect(usage.cost.total).toBe(0);
  const engine = new PiAiAdapter({ wire: { route: "openai-completions", providerId: "deepseek", baseUrl: "https://api.deepseek.com", pricing: { providerId: "deepseek", apiModel: "m", modelKey: "deepseek:m", connectionId: null, currency: "USD", rates: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: null }, multiplier: 1, source: "configured", contentHash: "test", fetchedAt: "2026-09-07T00:00:00Z", capturedAt: "2026-09-07T00:00:00Z", unsupportedBilling: false }, load: async () => ({ core: { createProvider: () => ({ id: "deepseek" }), createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "m", provider: "deepseek" }), streamSimple: () => (async function* () { yield { type: "done", message: { content: [], stopReason: "stop", usage } }; })() }) }, api: { stream: () => {}, streamSimple: () => {} } }) } });
  const input = { request: { requestId: "r", model: "m", messages: [], tools: [], options: {} }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput;
  for await (const event of await engine.dispatch(input)) if (event.type === "done") { expect(event.usage.cost).toBeCloseTo(0.0064, 10); expect(event.usage.costProvenance?.basis).toBe("estimated"); }
});

it("persists a versioned replay envelope with provider-qualified reasoning state", async () => {
  const engine = new PiAiAdapter({ wire: {
    route: "openai-responses",
    providerId: "custom",
    modelId: "vendor/reasoning",
    baseUrl: "https://relay.example/v1",
    load: async () => ({
      core: {
        createProvider: () => ({ id: "custom" }),
        createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "vendor/reasoning", provider: "custom" }), streamSimple: () => (async function* () {
          yield { type: "done", message: { content: [{ type: "thinking", thinking: "internal", thinkingSignature: "sig-1" }], stopReason: "stop" } };
        })() }),
      },
      api: { stream: () => {}, streamSimple: () => {} },
    }),
  } });
  const input = { request: { requestId: "replay", model: "vendor/reasoning", messages: [], tools: [], options: {} }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput;
  for await (const event of await engine.dispatch(input)) {
    if (event.type === "done") expect(event.content).toEqual([{ type: "reasoning", text: "internal", signature: "sig-1", replay: { schemaVersion: 1, adapterFamily: "pi-ai", providerId: "custom", protocol: "openai-responses", modelId: "vendor/reasoning", payload: { thinkingSignature: "sig-1" } } }]);
  }
});

it("drops replay signatures when the provider identity does not match", async () => {
  let context: unknown;
  const engine = new PiAiAdapter({ wire: {
    route: "openai-responses",
    providerId: "custom",
    modelId: "vendor/reasoning",
    baseUrl: "https://relay.example/v1",
    load: async () => ({
      core: {
        createProvider: () => ({ id: "custom" }),
        createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "vendor/reasoning", provider: "custom" }), streamSimple: (_model, receivedContext) => {
          context = receivedContext;
          return (async function* () { yield { type: "done", message: { content: [], stopReason: "stop" } }; })();
        } }),
      },
      api: { stream: () => {}, streamSimple: () => {} },
    }),
  } });
  const input = {
    request: {
      requestId: "replay-mismatch",
      model: "vendor/reasoning",
      messages: [{ role: "assistant", content: [{ type: "reasoning", text: "old", replay: { schemaVersion: 1, adapterFamily: "pi-ai", providerId: "other", protocol: "openai-responses", modelId: "vendor/reasoning", payload: { thinkingSignature: "foreign" } } }] }],
      tools: [],
      options: {},
    },
    credential: {},
    signal: new AbortController().signal,
  } as unknown as LlmAdapterDispatchInput;
  for await (const _event of await engine.dispatch(input)) { /* drain */ }
  expect((context as { messages: Array<{ content: Array<Record<string, unknown>> }> }).messages[0]?.content[0]).toEqual({ type: "thinking", thinking: "old" });
});

it.each(["openai-completions", "openai-responses", "anthropic-messages"] as const)("uses explicit custom %s fields and clears SDK inferred Auto defaults", async (route) => {
  for (const effort of [undefined, "high"] as const) {
    let payload: Record<string, unknown> = {};
    const engine = new PiAiAdapter({ wire: { route, providerId: "custom", baseUrl: "https://relay.example/v1", load: async () => ({ core: { createProvider: () => ({ id: "custom" }), createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "alias", provider: "custom" }), streamSimple: (_model, _context, options) => {
      payload = (options.onPayload as unknown as (v: object) => Record<string, unknown>)({ model: "alias", reasoning_effort: "medium", reasoning: { effort: "medium" }, thinking: { type: "enabled" }, output_config: { effort: "medium", format: "json" } });
      return (async function* () { yield { type: "done", message: { content: [], stopReason: "stop" } }; })();
    } }) }, api: { stream: () => {}, streamSimple: () => {} } }) } });
    const input = { request: { requestId: "r", model: "alias", messages: [], tools: [], options: effort ? { reasoning: true, reasoningEffort: effort } : {} }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput;
    for await (const _event of await engine.dispatch(input)) { /* drain */ }
    if (!effort) expect(payload).toEqual({ model: "alias", output_config: { format: "json" } });
    else if (route === "openai-completions") { expect(payload.reasoning_effort).toBe("high"); expect(payload).not.toHaveProperty("reasoning"); }
    else if (route === "openai-responses") expect(payload.reasoning).toMatchObject({ effort: "high" });
    else expect(payload).toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: "high" } });
  }
});
