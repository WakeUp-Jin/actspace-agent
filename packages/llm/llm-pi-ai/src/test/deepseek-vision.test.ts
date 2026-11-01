import { afterEach, expect, it, vi } from "vitest";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import { LegacyProxyWireEngine } from "../legacy-proxy-wire-engine.js";
import { ProviderProxyPool, type LlmAdapterDispatchInput } from "@actspace/llm-service";
import { validateDeepSeekImage, validateDeepSeekImageMessages, validateDeepSeekPayload } from "../deepseek-images.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9wAAAABJRU5ErkJggg==", "base64");
const request = (): LlmAdapterDispatchInput => ({ request: { requestId: "r", sessionId: "s", routeId: "deepseek", model: "deepseek-flash", messages: [
  { role: "user", content: [{ type: "text", text: "Describe this image" }, { type: "image", artifactId: "image", mimeType: "image/png" }] },
  { role: "assistant", content: [{ type: "reasoning", text: "Read the image first", signature: "reasoning_content" }, { type: "tool-call", callId: "call_1", name: "read_file", arguments: "{}" }] },
  { role: "tool", callId: "call_1", content: "done" },
  { role: "user", content: "Continue" },
], tools: [{ name: "read_file", description: "Read", inputSchema: { type: "object", properties: {} }, definitionVersion: 1, definitionDigest: "fixture" }], options: { reasoning: true, reasoningEffort: "low" } }, credential: { apiKey: "fixture" }, signal: new AbortController().signal } as LlmAdapterDispatchInput);
const modelFacts = { contextWindow: 1_000_000, maxTokens: 393_216, input: ["text", "image"] as const, reasoning: true };
const chunks = [ { choices: [{ delta: { content: "Visible" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 4 } } } ];
afterEach(() => vi.unstubAllGlobals());

it("uses the real pi-ai serializer for image and reasoning replay without raising the default output budget", async () => {
  let body: any;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => { body = JSON.parse(init.body); return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }); }));
  const engine = new PiAiAdapter({ wire: { providerId: "deepseek", route: "openai-completions", baseUrl: "https://api.deepseek.com", modelFacts, readArtifact: async () => ({ data: png, mimeType: "image/wrong" }) } });
  const events = [];
  for await (const event of await engine.dispatch(request())) events.push(event);
  expect(events.at(-1)?.type).toBe("done");
  expect(body).toMatchObject({ model: "deepseek-flash", thinking: { type: "enabled" }, reasoning_effort: "low", max_tokens: 32768 });
  expect(body.messages.find((message: any) => message.role === "user").content).toContainEqual({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });
  expect(body.messages.find((message: any) => message.role === "assistant")).toMatchObject({ reasoning_content: "Read the image first", tool_calls: [{ id: "call_1" }] });
});

it("preserves the same image and reasoning on the scoped proxy path", async () => {
  let body: any;
  const pool = new ProviderProxyPool(async () => ({ ProxyAgent: class { async close() {} }, fetch: async () => new Response("") }));
  const engine = new LegacyProxyWireEngine({ providerId: "deepseek", route: "openai-completions", baseUrl: "https://api.deepseek.com", modelFacts, proxies: pool, readArtifact: async () => ({ data: png, mimeType: "image/png" }), loadSdk: async () => class { chat = { completions: { create: async (params: unknown) => { body = params; return (async function* () { yield* chunks; })(); } } }; } as never });
  const input = request();
  const events = [];
  for await (const event of await engine.stream({ ...input, credential: { ...input.credential, proxyUrl: "http://127.0.0.1:1234" } })) events.push(event);
  expect(events.at(-1)?.type).toBe("done");
  expect(body.messages[0].content[1].image_url.url).toBe(`data:image/png;base64,${png.toString("base64")}`);
  expect(body.messages[1].reasoning_content).toBe("Read the image first");
  expect(body.reasoning_effort).toBe("low");
  await pool.dispose();
});

it("rejects unsupported image inputs before sending and checks encoded payload size", async () => {
  expect(validateDeepSeekImage(png)).toBe("image/png");
  expect(() => validateDeepSeekImage(Buffer.from("<svg/>"))).toThrow("JPEG");
  expect(() => validateDeepSeekImage(new Uint8Array(32 * 1024 * 1024 + 1))).toThrow("32 MiB");
  expect(() => validateDeepSeekPayload({ content: "x".repeat(48 * 1024 * 1024) })).toThrow("48 MiB");
  expect(() => validateDeepSeekImageMessages(request().request.messages, false)).toThrow("不支持图片");
  expect(() => validateDeepSeekImageMessages([{ role: "assistant", content: [{ type: "image", artifactId: "a", mimeType: "image/png" }] }], true)).toThrow("user");
});
