import { describe, expect, it } from "vitest";
import { createCordisRoot, createCordisRootWithLoader, emitContained, inspectCordisAdmission, serialDispatch, toCordisBehavior, waterfallDispatch } from "../src/index.js";

describe("Cordis package boundary", () => {
  it("admits the exact published family without HMR", async () => { const report = await inspectCordisAdmission(); expect(report.packages).toHaveLength(5); expect(report.hmrAbsent).toBe(true); expect(report.failures).toEqual([]); });
  it("owns reverse async cleanup through a deterministic public Context seam", async () => {
    const cleanup: string[] = []; const root = await createCordisRootWithLoader(async () => ({ Context: FakeContext }));
    await root.mount("first", () => async () => { cleanup.push("first"); }, { services: { alpha: { value: 1 } } });
    await root.mount("second", () => () => { cleanup.push("second"); }, { inject: ["alpha"], services: { beta: { value: 2 } } });
    expect(root.facts().map((fact) => fact.state)).toEqual(["ACTIVE", "ACTIVE"]); await root.dispose(); await root.dispose(); expect(cleanup).toEqual(["second", "first"]);
  });

  it("normalizes DSH apply modules to real Cordis plugins and collects returned disposers", async () => {
    const root = await createCordisRoot();
    const cleanup: string[] = [];
    try {
      const fiber = root.context.plugin?.(toCordisBehavior({
        inject: [],
        apply: (ctx, config) => {
          ctx.provide?.("dsh.behavior", config);
          return () => cleanup.push("disposed");
        },
      }, "dsh-behavior"), { enabled: true });
      await fiber;
      expect(root.context.get?.("dsh.behavior")).toEqual({ enabled: true });
    } finally {
      await root.dispose();
    }
    expect(cleanup).toEqual(["disposed"]);
  });

  it("rejects the retired activate protocol instead of adapting it", () => {
    expect(() => toCordisBehavior({ activate: () => ({ dispose: () => undefined }) }, "legacy")).toThrow(/retired activate/);
  });

  it("bridges Agent Loop events through the real Cordis Context", async () => {
    const root = await createCordisRoot();
    const calls: string[] = [];
    root.context.on?.("agent/status", (payload) => { calls.push(String((payload as { status?: string }).status)); });
    root.context.on?.("agent/request", async (payload, next) => ({ ...(await next?.()) as Record<string, unknown>, transformed: true }));
    try {
      await root.context.parallel?.("agent/status", { status: "started" });
      const transformed = await root.context.waterfall?.("agent/request", { requestId: "r" }, () => ({ requestId: "r" }));
      expect(transformed).toMatchObject({ requestId: "r", transformed: true });
      expect(calls).toEqual(["started"]);
    } finally {
      await root.dispose();
    }
  });

  it("preserves Cordis continuation and serial bail semantics", async () => {
    const root = await createCordisRoot();
    const order: string[] = [];
    try {
      root.context.on?.("agent/request", async (payload, next) => { order.push("outer"); const value = await next?.(); return { ...(value as Record<string, unknown>), wrapped: true }; });
      root.context.on?.("agent/request", async (payload, next) => { order.push("inner"); return { ...(await next?.() as Record<string, unknown>), inner: true }; });
      const value = await waterfallDispatch(root.context, "agent/request", { requestId: "r" }, () => ({ requestId: "r", builtIn: true }));
      expect(value).toMatchObject({ requestId: "r", builtIn: true, inner: true, wrapped: true });
      expect(order).toEqual(["outer", "inner"]);

      root.context.on?.("agent/turn-stopping", () => { order.push("stop"); return "handled"; });
      root.context.on?.("agent/turn-stopping", () => { order.push("after-stop"); return undefined; });
      await expect(serialDispatch(root.context, "agent/turn-stopping", { reason: "completed" })).resolves.toBe("handled");
      expect(order).toContain("stop");
      expect(order).not.toContain("after-stop");
    } finally {
      await root.dispose();
    }
  });

  it("contains notification failures without starving sibling listeners", async () => {
    const root = await createCordisRoot();
    const calls: string[] = [];
    try {
      root.context.on?.("agent/status", () => { calls.push("first"); throw new Error("observer failed"); });
      root.context.on?.("agent/status", () => { calls.push("second"); });
      await emitContained(root.context, "agent/status", { status: "started" });
      expect(calls).toEqual(["first", "second"]);
    } finally {
      await root.dispose();
    }
  });
});

describe.skipIf(process.env.ACTSPACE_REAL_CORDIS !== "1")("real Cordis Loader family", () => {
  it("boots Loader/Include/Group/Timer and drains an Entry", async () => { const root = await createCordisRoot(); try { await root.mount("real-entry", () => () => undefined, { services: { "test.service": { ready: true } } }); expect(await root.awaitSettlement()).toMatchObject({ settled: true }); expect(root.facts()[0]).toMatchObject({ state: "ACTIVE", providedServices: ["test.service"] }); } finally { expect(await root.dispose()).toMatchObject({ disposed: true }); } });
});

class FakeContext {
  readonly #fibers: FakeFiber[] = []; readonly #services = new Map<string, unknown>(); readonly reflect = { registry: { values: () => this.#fibers.map((fiber) => ({ state: fiber.state === 3 ? "FAILED" : "ACTIVE", inject: [] })) } };
  get(name: string) { return this.#services.get(name); }
  plugin(plugin: unknown) { const fiber = new FakeFiber(plugin as { inject?: readonly string[]; apply(context: { provide(name: string, value: unknown): void }): unknown }, this.#services); this.#fibers.push(fiber); return fiber; }
  async dispose() { for (const fiber of [...this.#fibers].reverse()) await fiber.dispose(); }
}
class FakeFiber implements PromiseLike<void> {
  state = 0; readonly inject: Record<string, unknown>; #effect: (() => void | Promise<void>) | undefined; #started: Promise<void> | undefined;
  constructor(private readonly plugin: { inject?: readonly string[]; apply(context: { provide(name: string, value: unknown): void }): unknown }, private readonly services: Map<string, unknown>) { this.inject = Object.fromEntries((plugin.inject ?? []).map((name) => [name, {}])); }
  then<TResult1 = void, TResult2 = never>(onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { return (this.#started ??= this.start()).then(onfulfilled, onrejected); }
  async start() { try { if (Object.keys(this.inject).some((name) => !this.services.has(name))) return; const effect = await this.plugin.apply({ provide: (name, value) => { this.services.set(name, value); } }); if (typeof effect === "function") this.#effect = effect as () => void | Promise<void>; this.state = 2; } catch (error) { this.state = 3; throw error; } }
  async dispose() { if (this.state === 4) return; this.state = 4; await this.#effect?.(); }
}
