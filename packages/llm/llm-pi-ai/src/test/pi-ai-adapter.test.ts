import { expect, it, vi } from "vitest";
import type { LlmAdapterDispatchInput, LlmStreamEvent } from "@actspace/llm-service";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import { ProviderProxyPool } from "@actspace/llm-service";

async function* done(): AsyncGenerator<LlmStreamEvent> {
  yield { type: "done", stopReason: "stop", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0, costCurrency: "USD", source: "estimated" }, content: [] };
}

function input(proxyUrl?: string): LlmAdapterDispatchInput {
  return { request: { requestId: "r", routeId: "route", model: "model", messages: [], tools: [], options: {} }, credential: { ...(proxyUrl === undefined ? {} : { proxyUrl }) }, signal: new AbortController().signal };
}

it("selects the scoped legacy backend before wire I/O", async () => {
  const pool = new ProviderProxyPool(async () => ({ ProxyAgent: class { async close() {} }, fetch: async () => new Response("") }));
  const adapter = new PiAiAdapter({
    wire: { route: "openai-completions", providerId: "fixture", baseUrl: "https://provider.example" },
    legacyProxy: { route: "openai-completions", providerId: "fixture", baseUrl: "https://provider.example", proxies: pool, loadSdk: async () => class { chat = { completions: { create: async () => (async function* () { yield { choices: [{ delta: {}, finish_reason: "stop" }] }; })() } }; } as never },
  });

  await adapter.dispatch(input("http://127.0.0.1:7890"));
  await pool.dispose();
});
