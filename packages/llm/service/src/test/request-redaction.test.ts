import { describe, expect, it } from "vitest";
import { inspect } from "node:util";
import { LlmService } from "../service.js";
import { LlmRouteRegistry } from "../route-registry.js";
import { LlmRuntimeError } from "../failure.js";
import type { LlmAdapter } from "../adapter.js";
import type { LlmStreamEvent } from "../stream.js";

const secret = "fixture_NONSTANDARD_credential_42";
const headerSecret = "fixture_PRIVATE_header_43";
const proxySecret = "fixture_PROXY_password_44";
const failure = { kind: "rate-limit" as const, retryable: true, httpStatus: 429, retryAfterMs: 250, attempt: 2,
  message: `provider echoed ${secret} ${headerSecret} ${proxySecret}`, providerCode: secret, causeCode: headerSecret, providerMessage: proxySecret };

function prepare(adapter: LlmAdapter, apiKey = secret) {
  const routes = new LlmRouteRegistry();
  routes.register({ routeId: "test", providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {}, adapter });
  return new LlmService(routes, { resolve: async () => ({ apiKey, headers: { "X-Api-Key": headerSecret }, proxyUrl: `http://user:${proxySecret}@localhost:8080` }) })
    .prepare({ routeId: "test", model: "fixture", messages: [] });
}
function assertSafe(value: unknown) {
  const serialized = inspect(value, { depth: 10 });
  expect(serialized).toContain("[REDACTED]");
  for (const value of [secret, headerSecret, proxySecret]) expect(serialized).not.toContain(value);
}

describe("request credential error boundary", () => {
  it.each(["dispatch", "iterator", "cancel"] as const)("sanitizes %s throws without retaining raw causes", async (phase) => {
    const raw = new LlmRuntimeError(failure, new Error(secret));
    expect(inspect(raw)).toContain(secret); // Positive control for the leak assertion.
    const call = prepare({ adapterVersion: "test", dispatch: async () => {
      if (phase === "dispatch") throw raw;
      return (async function* (): AsyncIterable<LlmStreamEvent> { throw raw; })();
    }, cancel: async () => { throw raw; } });
    let error: unknown;
    try {
      const stream = await call.dispatch();
      if (phase === "cancel") await stream.abort();
      else for await (const event of stream) void event;
    } catch (caught) { error = caught; }
    assertSafe(error);
    expect(error).toBeInstanceOf(LlmRuntimeError);
    expect((error as LlmRuntimeError).failure).toMatchObject({ kind: "rate-limit", retryable: true, httpStatus: 429, retryAfterMs: 250, attempt: 2 });
    expect(call.released).toBe(true);
  });

  it("sanitizes terminal errors and abort reasons, leaving successful content intact", async () => {
    const call = prepare({ adapterVersion: "test", dispatch: async function* () {
      yield { type: "text-delta", text: "ordinary content" };
      yield { type: "error", failure };
      yield { type: "aborted", reason: failure.message };
    } });
    const events = [];
    for await (const event of await call.dispatch()) events.push(event);
    expect(events[0]).toEqual({ type: "text-delta", text: "ordinary content" });
    assertSafe(events.slice(1));
  });

  it("keeps concurrent credential scopes separate", async () => {
    const other = "fixture_OTHER_credential_45";
    const make = (apiKey: string) => prepare({ adapterVersion: "test", dispatch: async function* () {
      yield { type: "aborted", reason: `${secret} ${other}` };
    } }, apiKey);
    const results = await Promise.all([secret, other].map(async (key) => {
      const events = [];
      for await (const event of await make(key).dispatch()) events.push(event);
      return events;
    }));
    expect(results[0]).toEqual([{ type: "aborted", reason: `[REDACTED] ${other}` }]);
    expect(results[1]).toEqual([{ type: "aborted", reason: `${secret} [REDACTED]` }]);
  });
});
