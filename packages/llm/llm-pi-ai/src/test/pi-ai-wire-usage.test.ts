import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmAdapterDispatchInput, LlmStreamEvent } from "@actspace/llm-service";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import type { PiAiWireRoute } from "../pi-ai-stream.js";

afterEach(() => vi.unstubAllGlobals());

const request = (signal = new AbortController().signal): LlmAdapterDispatchInput => ({
  request: { requestId: "wire-usage", sessionId: "s", routeId: "custom", model: "fixture", messages: [{ role: "user", content: "hi" }], tools: [], options: { maxTokens: 16 } },
  credential: { apiKey: "fixture" }, signal,
} as LlmAdapterDispatchInput);

const empty = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null };
const routes: PiAiWireRoute[] = ["openai-completions", "openai-responses", "anthropic-messages"];
const sse = (event: Record<string, unknown>) => `${typeof event.type === "string" ? `event: ${event.type}\n` : ""}data: ${JSON.stringify(event)}\n\n`;

function wire(route: PiAiWireRoute, usage?: Record<string, unknown>, deltaUsage?: Record<string, unknown>): string {
  if (route === "openai-completions") return [
    { choices: [{ delta: { content: "Visible" }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], ...(usage === undefined ? {} : { usage }) },
    ...(deltaUsage ? [{ choices: [], usage: deltaUsage }] : []),
  ].map(sse).join("") + "data: [DONE]\n\n";
  if (route === "openai-responses") return sse({ type: "response.completed", response: { id: "resp_fixture", status: "completed", output: [], ...(usage === undefined ? {} : { usage }) } });
  return [
    { type: "message_start", message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, stop_sequence: null, ...(usage === undefined ? {} : { usage }) } },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, ...(deltaUsage === undefined ? {} : { usage: deltaUsage }) },
    { type: "message_stop" },
  ].map(sse).join("");
}

function counts(route: PiAiWireRoute, input?: number, output?: number, cache = false): Record<string, unknown> {
  const anthropic = route === "anthropic-messages";
  const completions = route === "openai-completions";
  return {
    ...(input === undefined ? {} : { [completions ? "prompt_tokens" : "input_tokens"]: input }),
    ...(output === undefined ? {} : { [completions ? "completion_tokens" : "output_tokens"]: output }),
    ...(cache ? anthropic
      ? { cache_read_input_tokens: 4, cache_creation_input_tokens: 2, output_tokens_details: { thinking_tokens: 1 } }
      : { [completions ? "prompt_tokens_details" : "input_tokens_details"]: { cached_tokens: 4, cache_write_tokens: 2 }, [completions ? "completion_tokens_details" : "output_tokens_details"]: { reasoning_tokens: 1 } }
      : {}),
  };
}

async function terminal(route: PiAiWireRoute, body: string | ReadableStream<Uint8Array>, signal?: AbortSignal, onEvent?: (event: LlmStreamEvent) => void) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": "text/event-stream" } })));
  const adapter = new PiAiAdapter({ wire: { providerId: "custom", route, baseUrl: "https://fixture.example", pricing: {
    providerId: "custom", apiModel: "fixture", modelKey: "custom:fixture", connectionId: null, currency: "USD",
    rates: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 1 }, multiplier: 1, source: "configured", contentHash: "fixture",
    fetchedAt: "2026-10-22T00:00:00Z", capturedAt: "2026-10-22T00:00:00Z", unsupportedBilling: false,
  } } });
  const events: LlmStreamEvent[] = [];
  for await (const event of await adapter.dispatch(request(signal))) { events.push(event); onEvent?.(event); }
  const last = events.at(-1);
  if (!last || !(last.type === "done" || last.type === "error" || last.type === "aborted")) throw new Error("Missing terminal event");
  return last;
}

describe.each(routes)("real pi-ai %s wire usage", (route) => {
  it.each([undefined, {}])("keeps missing usage or fields unknown (%j)", async (usage) => {
    const last = await terminal(route, wire(route, usage));
    expect(last.type).toBe("done");
    expect(last.usage).toMatchObject({ ...empty, source: "unknown", cost: null, costProvenance: { basis: "unknown", reason: "usage-unavailable" } });
  });

  it.each(["input", "output"])("retains partial %s without fabricating other fields", async (field) => {
    const last = await terminal(route, wire(route, counts(route, field === "input" ? 12 : undefined, field === "output" ? 3 : undefined)));
    expect(last.type).toBe("done");
    expect(last.usage).toMatchObject({ ...empty, [field === "input" ? "inputTokens" : "outputTokens"]: field === "input" ? 12 : 3, source: "provider-reported", cost: null });
  });

  it.each([[0, 0], [12, 3]])("preserves explicitly reported input=%i and output=%i", async (input, output) => {
    const last = await terminal(route, wire(route, counts(route, input, output)));
    expect(last.type).toBe("done");
    expect(last.usage).toMatchObject({ ...empty, inputTokens: input, outputTokens: output, source: "provider-reported", costProvenance: { basis: "estimated" } });
    expect(last.usage.cost).toBeCloseTo((input * 2 + output * 8) / 1_000_000);
  });

  it("normalizes disjoint cache buckets and keeps reasoning within output", async () => {
    const last = await terminal(route, wire(route, counts(route, 12, 3, true)));
    expect(last.type).toBe("done");
    expect(last.usage).toMatchObject({ inputTokens: route === "anthropic-messages" ? 12 : 6, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 2, reasoningTokens: 1, source: "provider-reported" });
  });

  it.each([null, -1, "12"])("does not count invalid provider input %j as zero", async (invalid) => {
    const usage = { ...counts(route, undefined, 3), [route === "openai-completions" ? "prompt_tokens" : "input_tokens"]: invalid };
    const last = await terminal(route, wire(route, usage));
    expect(last.type).toBe("done");
    expect(last.usage).toMatchObject({ ...empty, outputTokens: 3, source: "provider-reported", cost: null });
  });
});

it.each(["openai-completions", "anthropic-messages"] as const)("merges partial %s usage frames without erasing earlier facts", async (route) => {
  const last = await terminal(route, wire(route, counts(route, 12), counts(route, undefined, 3)));
  expect(last.type).toBe("done");
  expect(last.usage).toMatchObject({ ...empty, inputTokens: 12, outputTokens: 3, source: "provider-reported" });
});

it("retains input usage when Anthropic fails after message_start", async () => {
  const body = sse({ type: "message_start", message: { id: "msg_fixture", usage: { input_tokens: 12 } } })
    + sse({ type: "error", error: { type: "overloaded_error", message: "fixture overload" } });
  const last = await terminal("anthropic-messages", body);
  expect(last.type).toBe("error");
  expect(last.usage).toMatchObject({ ...empty, inputTokens: 12, source: "provider-reported", cost: null });
});

it("retains partial usage on a failed Responses terminal frame", async () => {
  const last = await terminal("openai-responses", sse({ type: "response.failed", response: {
    id: "resp_fixture", status: "failed", output: [], usage: { input_tokens: 12 },
    error: { code: "server_error", message: "fixture overload" },
  } }));
  expect(last.type).toBe("error");
  expect(last.usage).toMatchObject({ ...empty, inputTokens: 12, source: "provider-reported", cost: null });
});

it.each(routes)("preserves only observed %s facts when cancelled mid-stream", async (route) => {
  const abort = new AbortController();
  const frames = route === "anthropic-messages" ? [
    { type: "message_start", message: { id: "msg_fixture", usage: { input_tokens: 12 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Visible" } },
  ] : route === "openai-responses" ? [
    { type: "response.created", response: { id: "resp_fixture" } },
    { type: "response.output_item.added", output_index: 0, item: { id: "msg_fixture", type: "message", role: "assistant", content: [] } },
    { type: "response.output_text.delta", output_index: 0, delta: "Visible" },
  ] : [{ choices: [{ delta: { content: "Visible" }, finish_reason: null }], usage: { prompt_tokens: 12 } }];
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(frames.map(sse).join("")));
    abort.signal.addEventListener("abort", () => controller.error(new DOMException("fixture cancelled", "AbortError")), { once: true });
  } });
  let observedText = false;
  const last = await terminal(route, body, abort.signal, (event) => {
    if (event.type === "text-delta") { observedText = true; abort.abort(); }
  });
  expect(observedText).toBe(true);
  expect(last.type).toBe("aborted");
  expect(last.usage).toMatchObject({ ...empty, ...(route === "openai-responses" ? {} : { inputTokens: 12 }), source: route === "openai-responses" ? "unknown" : "provider-reported", cost: null });
});
