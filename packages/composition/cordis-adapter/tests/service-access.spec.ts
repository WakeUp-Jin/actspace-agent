import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTSPACE_SERVICE_DEFINITIONS,
  bindServiceType,
  CordisContextClass,
  getLeasedService,
  getService,
  provideService,
  requireService,
  serviceKey,
  serviceView,
} from "../src/index.js";
import { typeFixture } from "./support/type-fixture.js";

type Clock = { now(): number };
const CLOCK = serviceKey<Clock>("fixture.clock");

describe("service access by definition", () => {
  it("reads what was provided under the same key from a real Cordis context", async () => {
    const ctx = new CordisContextClass();
    expect(getService(ctx, CLOCK)).toBeUndefined();
    provideService(ctx, CLOCK, { now: () => 42 });
    expect(getService(ctx, CLOCK)?.now()).toBe(42);
    expect(requireService(ctx, CLOCK, "Fixture consumer").now()).toBe(42);
    await ctx.fiber.dispose();
  });

  it("reports a missing required service with the consumer's name and the service id", () => {
    const ctx = new CordisContextClass();
    expect(() => requireService(ctx, CLOCK, "Agent factory plugin")).toThrow(new Error("Agent factory plugin requires fixture.clock."));
    expect(() => requireService(undefined, CLOCK, "Fixture consumer")).toThrow(new Error("Fixture consumer requires fixture.clock."));
  });

  it("treats a context without get or provide as having no services", () => {
    expect(getService({}, CLOCK)).toBeUndefined();
    expect(getService(undefined, CLOCK)).toBeUndefined();
    expect(() => provideService({}, CLOCK, { now: () => 1 })).not.toThrow();
  });

  it("calls get and provide as methods of the context", () => {
    // Cordis 的 Context 是 Proxy，方法脱离对象调用会取不到内部状态。
    const store = new Map<string, unknown>();
    const ctx = {
      store,
      get(this: { store: Map<string, unknown> }, name: string) { return this.store.get(name); },
      provide(this: { store: Map<string, unknown> }, name: string, value?: unknown) { this.store.set(name, value); },
    };
    provideService(ctx, CLOCK, { now: () => 7 });
    expect([...store.keys()]).toEqual(["fixture.clock"]);
    expect(getService(ctx, CLOCK)?.now()).toBe(7);
  });

  it("reads a leased service by the key's id", () => {
    const asked: string[] = [];
    const clock: Clock = { now: () => 3 };
    const lease = { getService: <TService>(name: string) => { asked.push(name); return (name === "fixture.clock" ? clock : undefined) as TService | undefined; } };
    expect(getLeasedService(lease, CLOCK)).toBe(clock);
    expect(getLeasedService(lease, serviceKey<Clock>("fixture.other"))).toBeUndefined();
    expect(asked).toEqual(["fixture.clock", "fixture.other"]);
  });

  it("types a catalog entry without copying it", () => {
    const typed = bindServiceType<Clock>(ACTSPACE_SERVICE_DEFINITIONS.sessionJournal);
    expect(typed).toBe(ACTSPACE_SERVICE_DEFINITIONS.sessionJournal);
    expect(typed.id).toBe("session.journal");
  });

  it("builds frozen keys; only views carry the view mark", () => {
    const key = serviceKey<Clock>("fixture.clock");
    const view = serviceView<{ now(): unknown }>("fixture.clock");
    expect(key).toEqual({ id: "fixture.clock" });
    expect(view).toEqual({ id: "fixture.clock", view: true });
    expect(Object.isFrozen(key) && Object.isFrozen(view)).toBe(true);
  });
});

describe("service access types", () => {
  const fixture = typeFixture(fileURLToPath(new URL("./fixtures/service-access-types.ts", import.meta.url)));

  it("compiles the fixture cleanly: every expected error is a real one", () => {
    expect(fixture.expectedErrors).toBe(8);
    expect(fixture.asWritten()).toEqual([]);
  }, 60_000);

  it("rejects each misuse for the intended reason", () => {
    const errors = fixture.withoutDirectives();
    expect(Object.fromEntries(errors.map((error) => [error.label, error.code]))).toEqual({
      "unknown-member": 2339,
      "maybe-missing": 2532,
      "wrong-shape": 2353,
      "wrong-return": 2322,
      "provide-view": 2345,
      "unknown-entry": 2551,
      "untyped-entry": 2339,
      "uncovered-view": 2344,
    });
    expect(errors).toHaveLength(8);
  }, 60_000);
});
