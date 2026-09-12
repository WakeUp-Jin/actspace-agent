import { afterEach, expect, it, vi } from "vitest";
import { PiAiWireEngine } from "../pi-ai-wire-engine.js";
import { LegacyProxyWireEngine } from "../legacy-proxy-wire-engine.js";
import { prepareImageMessages } from "../image-messages.js";
import type { LlmAdapterDispatchInput, LlmMessage } from "@actspace/llm-service";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9wAAAABJRU5ErkJggg==", "base64");
const messages: readonly LlmMessage[] = [
  { role: "user", content: "Read both images" },
  { role: "assistant", content: ["a", "b"].map((callId) => ({ type: "tool-call", callId, name: "read_file", arguments: "{}" })) },
  ...["a", "b"].map((callId): LlmMessage => ({ role: "tool", callId, content: [{ type: "text", text: `Read ${callId}` }, { type: "image", artifactId: callId, mimeType: "image/png" }] })),
];
const modelFacts = { contextWindow: 1_000_000, maxTokens: 32768, input: ["text", "image"] as const, reasoning: true };
function input(): LlmAdapterDispatchInput { return { request: { requestId: "r", sessionId: "s", routeId: "default", model: "deepseek-flash", messages, tools: [], options: {} }, credential: { apiKey: "fixture" }, signal: new AbortController().signal } as LlmAdapterDispatchInput; }
const chunks = [{ choices: [{ delta: { content: "Visible" }, finish_reason: "stop" }] }];
afterEach(() => vi.unstubAllGlobals());

it("sends real DeepSeek tool images after the complete tool-result batch", async () => {
  let body: any;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => { body = JSON.parse(init.body); return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }); }));
  const readArtifact = vi.fn(async () => ({ data: png, mimeType: "image/png" }));
  const engine = new PiAiWireEngine({ providerId: "deepseek", route: "openai-completions", baseUrl: "https://api.deepseek.com", modelFacts, readArtifact });
  const events = [];
  for await (const event of await engine.stream(input())) events.push(event);
  expect(events.at(-1)?.type).toBe("done");
  expect(body.messages.slice(-3).map((message: any) => message.role)).toEqual(["tool", "tool", "user"]);
  expect(body.messages.at(-1).content.filter((part: any) => part.type === "image_url")).toHaveLength(2);
  expect(readArtifact).toHaveBeenCalledWith("s", "a");
  expect(JSON.stringify(messages)).not.toContain("base64");
});

it.each(["openai-completions", "openai-responses", "anthropic-messages"] as const)("preserves tool images in the legacy %s serializer", async (route) => {
  let body: any;
  const create = async (params: any) => { body = params; return (async function* () { if (route === "openai-completions") yield* chunks; else if (route === "openai-responses") yield { type: "response.completed", response: { output: [], usage: {} } }; else { yield { type: "message_start", message: { usage: {} } }; yield { type: "message_stop" }; } })(); };
  const engine = new LegacyProxyWireEngine({ route, providerId: "openrouter", baseUrl: "https://openrouter.ai/api/v1", modelFacts, readArtifact: async () => ({ data: png, mimeType: "image/png" }), loadSdk: async () => class { chat = { completions: { create } }; responses = { create }; messages = { stream: (params: any) => { body = params; return (async function* () { yield { type: "message_start", message: { usage: {} } }; yield { type: "message_stop" }; })(); } }; } as never });
  for await (const _event of await engine.stream(input())) { /* exhaust transport */ }
  expect(JSON.stringify(body)).toContain(png.toString("base64"));
  if (route === "openai-completions") expect(body.messages.slice(-3).map((m: any) => m.role)).toEqual(["tool", "tool", "user"]);
  if (route === "openai-responses") expect(body.input.slice(-3).map((m: any) => m.type ?? m.role)).toEqual(["function_call_output", "function_call_output", "user"]);
  if (route === "anthropic-messages") expect(body.messages.at(-1).content.map((m: any) => [m.type, m.content[1].type])).toEqual([["tool_result", "image"], ["tool_result", "image"]]);
});

it("keeps text-only requests explicit and does not load image bytes", async () => {
  const normalized = prepareImageMessages(messages, false, false);
  expect(JSON.stringify(normalized)).toContain("cannot see it");
  expect(normalized.flatMap((m) => typeof m.content === "string" ? [] : m.content).some((b) => b.type === "image")).toBe(false);
  expect(messages[2].content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image" })]));
});

it.each(["openai-responses", "anthropic-messages"] as const)("passes structured tool images to pi-ai for %s", async (route) => {
  let context: any;
  const engine = new PiAiWireEngine({ providerId: "fixture", route, baseUrl: "https://example.test", modelFacts,
    readArtifact: async () => ({ data: png, mimeType: "image/png" }),
    load: async () => ({ core: { createProvider: () => ({ id: "fixture" }), createModels: () => ({ setProvider() {}, getModel: () => ({ id: "fixture", provider: "fixture" }), streamSimple(_model: any, value: any) { context = value; return (async function* () { yield { type: "done", message: { content: [], stopReason: "stop" } }; })(); } }) }, api: { stream() {}, streamSimple() {} } }),
  });
  for await (const _event of await engine.stream(input())) { /* exhaust */ }
  if (route === "anthropic-messages") {
    const results = context.messages.filter((m: any) => m.role === "toolResult");
    expect(results).toHaveLength(2);
    expect(results[0].content[1]).toMatchObject({ type: "image", data: png.toString("base64") });
  } else {
    expect(context.messages.slice(-3).map((m: any) => m.role)).toEqual(["toolResult", "toolResult", "user"]);
    expect(context.messages.at(-1).content.filter((b: any) => b.type === "image")).toHaveLength(2);
  }
});
