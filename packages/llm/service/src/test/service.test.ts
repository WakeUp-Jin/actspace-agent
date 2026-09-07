import { describe, expect, it } from "vitest";
import { LlmService } from "../service.js";
import { LlmRouteRegistry } from "../route-registry.js";
import type { LlmAdapter } from "../adapter.js";
import type { CredentialResolver } from "../credential-port.js";
import type { LlmStreamEvent } from "../stream.js";
import { EMPTY_LLM_USAGE } from "../usage.js";

async function* completedStream(): AsyncIterable<LlmStreamEvent> {
  yield { type: "text-delta", text: "hello" };
  yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "hello" }] };
}

function adapter(calls: string[]): LlmAdapter {
  return { adapterVersion: "test", dispatch: async ({ request }) => { calls.push(request.requestId); return completedStream(); } };
}

const credentials: CredentialResolver = { resolve: async () => ({ apiKey: "secret", baseUrl: "https://provider.test" }) };

describe("LlmService", () => {
  it("captures non-secret model context facts during preparation", () => {
    const routes = new LlmRouteRegistry();
    const handle = routes.register({ routeId: "facts", providerId: "provider", modelPattern: "*", adapter: { ...adapter([]), resolveModelFacts: () => ({ contextWindow: 1_000_000 }) }, credentialRef: "credential", defaults: {} });
    const prepared = new LlmService(routes, credentials).prepare({ routeId: "facts", model: "model", messages: [] });
    expect(prepared.request.contextWindow).toBe(1_000_000);
    prepared.release();
    return handle.dispose(100);
  });

  it("captures exact route registration and releases stream lease once", async () => {
    const calls: string[] = [];
    const routes = new LlmRouteRegistry();
    const old = routes.register({ routeId: "route", providerId: "provider", modelPattern: "*", adapter: adapter(calls), credentialRef: "credential", defaults: {} });
    const service = new LlmService(routes, credentials);
    const prepared = service.prepare({ routeId: "route", model: "model", messages: [{ role: "user", content: "hello" }], requestId: "old-request" });
    old.beginDrain();
    const replacement = routes.register({ routeId: "route", providerId: "provider", modelPattern: "*", adapter: adapter(calls), credentialRef: "credential", defaults: {} });
    const next = service.prepare({ routeId: "route", model: "model", messages: [{ role: "user", content: "new" }], requestId: "new-request" });
    expect(next.registration.registrationId).not.toBe(prepared.registration.registrationId);
    const stream = await prepared.dispatch();
    const output: LlmStreamEvent[] = [];
    for await (const event of stream) output.push(event);
    expect(output.at(-1)?.type).toBe("done");
    expect(calls).toEqual(["old-request"]);
    prepared.release();
    await old.dispose(100);
    expect(old.registration.leaseOwner.state).toBe("disposed");
    stream[Symbol.asyncIterator]();
    next.release();
    await replacement.dispose(100);
  });

  it("does not dispatch a released call and rejects a second dispatch", async () => {
    const routes = new LlmRouteRegistry();
    const handle = routes.register({ routeId: "route", providerId: "provider", modelPattern: "model/*", adapter: adapter([]), credentialRef: "credential", defaults: { temperature: 0 } });
    const service = new LlmService(routes, credentials);
    const prepared = service.prepare({ routeId: "route", model: "model/a", messages: [] });
    prepared.release();
    await expect(prepared.dispatch()).rejects.toThrow("released");
    const other = service.prepare({ routeId: "route", model: "model/a", messages: [] });
    const stream = await other.dispatch();
    await expect(other.dispatch()).rejects.toThrow("only dispatch once");
    await stream.abort("test");
    await handle.dispose(100);
  });

  it("keeps legacy transport behind the same ActSpace adapter seam", async () => {
    const calls: string[] = [];
    const { LegacyTransportAdapter } = await import("../legacy-transport-adapter.js");
    const legacy = new LegacyTransportAdapter({ send: async ({ request }) => { calls.push(`legacy:${request.routeId}`); return completedStream(); } });
    const routeRegistry = new LlmRouteRegistry();
    const legacyRoute = routeRegistry.register({ routeId: "proxied", providerId: "provider", modelPattern: "*", adapter: legacy, credentialRef: "credential", defaults: {} });
    const service = new LlmService(routeRegistry, credentials);
    const legacyStream = await service.prepare({ routeId: "proxied", model: "model", messages: [] }).dispatch();
    await legacyStream.abort();
    expect(calls).toEqual(["legacy:proxied"]);
    await legacyRoute.dispose(100);
  });

  it("disposes an adapter only after captured leases drain", async () => {
    let disposed = 0;
    let release!: () => void;
    const routes = new LlmRouteRegistry();
    const handle = routes.register({ routeId: "route", providerId: "provider", modelPattern: "*", adapter: { adapterVersion: "test", dispatch: async () => completedStream(), dispose: async () => { disposed += 1; } }, credentialRef: "credential", defaults: {} });
    const lease = routes.capture("route").leaseOwner.acquire();
    release = lease.release;

    const disposing = handle.dispose(500);
    await Promise.resolve();
    expect(disposed).toBe(0);
    release();
    await disposing;
    expect(disposed).toBe(1);
  });

  it("reports a stuck activation lease and can finish disposal after it releases", async () => {
    let disposed = 0;
    const routes = new LlmRouteRegistry();
    const handle = routes.register({ routeId: "route", providerId: "provider", modelPattern: "*", adapter: { adapterVersion: "test", dispatch: async () => completedStream(), dispose: async () => { disposed += 1; } }, credentialRef: "credential", defaults: {} });
    const lease = routes.capture("route").leaseOwner.acquire();

    await expect(handle.dispose(5)).rejects.toThrow("did not drain");
    expect(handle.registration.leaseOwner.state).toBe("draining");
    expect(disposed).toBe(0);

    lease.release();
    await handle.dispose(100);
    expect(handle.registration.leaseOwner.state).toBe("disposed");
    expect(disposed).toBe(1);
  });
});
