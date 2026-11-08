import { expect, it } from "vitest";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import { ProviderProxyPool } from "@actspace/llm-service";
import type { PiAiConnectionOptions } from "../pi-ai-stream.js";

function input(proxyUrl?: string): LlmAdapterDispatchInput {
  return { request: { requestId: "r", routeId: "route", model: "model", messages: [], tools: [], options: {} }, credential: { ...(proxyUrl === undefined ? {} : { proxyUrl }) }, signal: new AbortController().signal };
}

function backends(baseUrl: string) {
  const used: string[] = [];
  const pool = new ProviderProxyPool(async () => ({ ProxyAgent: class { async close() {} }, fetch: async () => new Response("") }));
  const wire: PiAiConnectionOptions = { route: "openai-completions", providerId: "fixture", baseUrl, proxies: pool, load: async () => {
    used.push("pi-ai");
    return { core: { createProvider: () => ({ id: "fixture" }), createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "model", provider: "fixture" }), streamSimple: () => (async function* () { yield { type: "done", message: { content: [], stopReason: "stop" } }; })() }) }, api: { stream: () => {}, streamSimple: () => {} } };
  } };
  const adapter = new PiAiAdapter({
    wire,
    legacyProxy: { route: "openai-completions", providerId: "fixture", baseUrl, proxies: pool, loadSdk: async () => { used.push("legacy"); return class { chat = { completions: { create: async () => (async function* () { yield { choices: [{ delta: {}, finish_reason: "stop" }] }; })() } }; } as never; } },
  });
  return { adapter, used, pool };
}

it("keeps a proxied request on pi-ai with a request-scoped fetch", async () => {
  const { adapter, used, pool } = backends("https://provider.example");
  for await (const _event of await adapter.dispatch(input("http://127.0.0.1:7890"))) { /* drain */ }
  expect(used).toEqual(["pi-ai"]);
  await pool.dispose();
});

it("selects the compatibility backend for official OpenRouter Completions before wire I/O", async () => {
  const { adapter, used, pool } = backends("https://openrouter.ai/api/v1");
  for await (const _event of await adapter.dispatch(input("http://127.0.0.1:7890"))) { /* drain */ }
  expect(used).toEqual(["legacy"]);
  await pool.dispose();
});
