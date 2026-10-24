import { afterEach, expect, it, vi } from "vitest";
import type { LlmAdapterDispatchInput, LlmCredential, LlmStreamEvent } from "@actspace/llm-service";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import type { PiAiConnectionOptions } from "../pi-ai-stream.js";

const secret = "fixture_unprefixed+/=:credential";
const echoed = `DIAGNOSTIC rejected ${secret} encoded ${encodeURIComponent(secret)}`;
const request = (credential: LlmCredential): LlmAdapterDispatchInput => ({
  request: { requestId: "redaction", routeId: "fixture", model: "fixture", messages: [{ role: "user", content: "hi" }], tools: [], options: {} },
  credential, signal: new AbortController().signal,
});
afterEach(() => vi.unstubAllGlobals());

it.each(["openai-completions", "openai-responses", "anthropic-messages"] as const)("redacts the final wire credential from real %s SDK errors", async (route) => {
  const seen: Headers[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: echoed } }), { status: 401, headers: { "content-type": "application/json" } });
  }));
  const adapter = new PiAiAdapter({ wire: { providerId: "custom", route, baseUrl: "https://fixture.example" } });
  const events: LlmStreamEvent[] = [];
  for await (const event of await adapter.dispatch(request({ apiKey: secret }))) events.push(event);
  expect(seen).toHaveLength(1);
  expect(seen[0]!.get(route === "anthropic-messages" ? "x-api-key" : "authorization")).toBe(route === "anthropic-messages" ? secret : `Bearer ${secret}`);
  expect(events.at(-1)).toMatchObject({ type: "error", failure: { kind: "authentication", httpStatus: 401, message: expect.stringContaining("DIAGNOSTIC") } });
  expect(JSON.stringify(events)).toContain("[REDACTED]");
  expect(JSON.stringify(events)).not.toContain(secret);
  expect(JSON.stringify(events)).not.toContain(encodeURIComponent(secret));
});

function loaded(stream: () => AsyncIterable<unknown>): NonNullable<PiAiConnectionOptions["load"]> {
  return async () => ({
    core: { createProvider: () => ({ id: "fixture" }), createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "fixture", provider: "fixture" }), streamSimple: stream }) },
    api: { stream: () => {}, streamSimple: () => {} },
  }) as never;
}

it.each(["error", "aborted"] as const)("redacts header-owned credentials from %s terminals", async (type) => {
  const adapter = new PiAiAdapter({ wire: { providerId: "fixture", route: "anthropic-messages", baseUrl: "https://fixture.example", load: loaded(async function* () {
    yield { type: "error", error: { content: [], stopReason: type === "aborted" ? "aborted" : "error", errorMessage: echoed, status: 401 } };
  }) } });
  const events = [];
  for await (const event of await adapter.dispatch(request({ headers: { Authorization: `Bearer ${secret}` } }))) events.push(event);
  expect(events.at(-1)?.type).toBe(type);
  const text = JSON.stringify(events);
  expect(text).toContain("DIAGNOSTIC");
  expect(text).toContain("[REDACTED]");
  expect(text).not.toContain(secret);
  expect(text).not.toContain(encodeURIComponent(secret));
});

it.each(["setup", "iteration", "legacy-setup"] as const)("sanitizes %s exceptions without retaining their raw cause", async (stage) => {
  const raw = Object.assign(new Error(echoed), { headers: { Authorization: secret } });
  const wire: PiAiConnectionOptions = { providerId: "fixture", route: "openai-completions", baseUrl: "https://fixture.example", load: stage === "setup" ? async () => { throw raw; } : loaded(async function* () { throw raw; }) };
  const adapter = new PiAiAdapter({ wire, ...(stage === "legacy-setup" ? { legacyProxy: { route: "openai-completions" as const, providerId: "openrouter", baseUrl: "https://openrouter.ai/api/v1", loadSdk: async () => { throw raw; } } } : {}) });
  let caught: unknown;
  try {
    for await (const _event of await adapter.dispatch(request({ apiKey: secret, ...(stage === "legacy-setup" ? { baseUrl: "https://openrouter.ai/api/v1" } : {}) }))) { /* drain */ }
  } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(Error);
  const error = caught as Error & { failure: unknown };
  expect(error.message).toContain("DIAGNOSTIC");
  expect(error.message).toContain("[REDACTED]");
  expect(`${error.stack} ${JSON.stringify(error)}`).not.toContain(secret);
  expect(`${error.stack} ${JSON.stringify(error)}`).not.toContain(encodeURIComponent(secret));
  expect(error.cause).toBeUndefined();
});

it("leaves successful assistant content unchanged and does not share secrets between requests", async () => {
  const otherSecret = "other_request_credential";
  const adapter = new PiAiAdapter({ wire: { providerId: "fixture", route: "openai-completions", baseUrl: "https://fixture.example", load: loaded(async function* () {
    yield { type: "text_delta", delta: secret };
    yield { type: "error", error: { content: [], stopReason: "error", errorMessage: `DIAGNOSTIC ${secret} ${otherSecret}`, status: 401 } };
  }) } });
  const run = async (apiKey: string) => {
    const events = [];
    for await (const event of await adapter.dispatch(request({ apiKey }))) events.push(event);
    return events;
  };
  const [first, second] = await Promise.all([run(secret), run(otherSecret)]);
  expect(first[0]).toEqual({ type: "text-delta", text: secret });
  expect(second[0]).toEqual({ type: "text-delta", text: secret });
  expect(first.at(-1)).toMatchObject({ type: "error", failure: { message: `DIAGNOSTIC [REDACTED] ${otherSecret}` } });
  expect(second.at(-1)).toMatchObject({ type: "error", failure: { message: `DIAGNOSTIC ${secret} [REDACTED]` } });
});
