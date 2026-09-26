import { afterEach, expect, it, vi } from "vitest";
import type { LlmAdapterDispatchInput, LlmCredential } from "@actspace/llm-service";
import { PiAiAdapter } from "../pi-ai-adapter.js";

const request = (credential: LlmCredential): LlmAdapterDispatchInput => ({
  request: { requestId: "r", sessionId: "s", routeId: "custom", model: "claude-sonnet-5", messages: [{ role: "user", content: "hi" }], tools: [], options: { maxTokens: 16 } },
  credential,
  signal: new AbortController().signal,
} as LlmAdapterDispatchInput);

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["Bearer", { headers: { Authorization: "Bearer relay-secret" } }, "authorization", "Bearer relay-secret", "x-api-key"],
  ["x-api-key", { apiKey: "relay-secret" }, "x-api-key", "relay-secret", "authorization"],
] as const)("sends only the %s auth header on the direct pi-ai Anthropic route", async (_label, credential, present, value, absent) => {
  const seen: Headers[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "fixture" } }), { status: 400, headers: { "content-type": "application/json" } });
  }));
  const adapter = new PiAiAdapter({ wire: { providerId: "custom", route: "anthropic-messages", baseUrl: "https://relay.example" } });
  for await (const _event of await adapter.dispatch(request(credential))) { /* drain */ }
  expect(seen).toHaveLength(1);
  expect(seen[0]!.get(present)).toBe(value);
  expect(seen[0]!.has(absent)).toBe(false);
});
