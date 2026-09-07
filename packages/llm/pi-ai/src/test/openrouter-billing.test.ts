import { afterEach, expect, it, vi } from "vitest";
import type { LlmAdapterDispatchInput, LlmStreamEvent } from "@actspace/llm-service";
import { PiAiWireEngine } from "../pi-ai-wire-engine.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["openai-completions", "openai-responses"] as const)("preserves raw OpenRouter billing through the real public SDK (%s)", async (route) => {
  const data = route === "openai-completions"
    ? [{ id: "test", choices: [{ index: 0, delta: { content: "hello" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0123 } }]
    : [{ type: "response.completed", response: { status: "completed", usage: { input_tokens: 10, output_tokens: 2, cost: 0.0123 } } }];
  const fetch = vi.fn(async () => new Response(data.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }));
  vi.stubGlobal("fetch", fetch);
  const load = vi.fn();
  const engine = new PiAiWireEngine({ route, providerId: "openrouter", baseUrl: "https://openrouter.ai/api/v1", load });
  const input = { request: { requestId: "r", model: "test", messages: [], tools: [], options: {} }, credential: { apiKey: "fixture" }, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput;
  const events: LlmStreamEvent[] = [];
  for await (const event of await engine.stream(input)) events.push(event);
  expect(load).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(events.at(-1)).toMatchObject({ type: "done", usage: { inputTokens: 10, outputTokens: 2, cost: 0.0123, costCurrency: "USD", costProvenance: { basis: "provider-reported" } } });
});
