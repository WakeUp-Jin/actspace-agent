import { describe, expect, it } from "vitest";
import { createCordisRoot, mountIsolatedCordisTree, type HarnessMountObserver, type HarnessMountPluginInfo, type HarnessPluginObservation } from "../src/index.js";

function entries(order: string[]) {
  return [
    { id: "provider", config: {}, provides: ["svc"], injects: [], origin: "builtin", module: { apply: (ctx: any) => { order.push("provider"); ctx.provide("svc", { hello: () => "hi" }); } } },
    { id: "consumer", config: {}, provides: [], injects: ["svc"], origin: "user", module: { inject: ["svc"], apply: (ctx: any) => { order.push("consumer"); order.push(String(ctx.get("svc").hello())); } } },
  ];
}

describe("mount observer", () => {
  it("is invisible without an observer", async () => {
    const root = await createCordisRoot();
    try {
      const order: string[] = [];
      const tree = await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: entries(order) });
      expect(order).toEqual(["provider", "consumer", "hi"]);
      await tree.dispose();
    } finally { await root.dispose(); }
  });

  it("asks once per entry, hands each plugin its wrapped context and reports apply results", async () => {
    const root = await createCordisRoot();
    try {
      const asked: HarnessMountPluginInfo[] = [];
      const applied: Record<string, { ok: boolean; ms: number; started: number }> = {};
      const wrapped: string[] = [];
      const observer: HarnessMountObserver = { observePlugin(entry, all) {
        asked.push(entry);
        expect(all.map(item => item.id)).toEqual(["provider", "consumer"]);
        let started = 0;
        return {
          wrapContext: ctx => { wrapped.push(entry.id); return ctx; },
          onApplyStart: () => { started++; },
          onApplyEnd: result => { applied[entry.id] = { ok: result.ok, ms: result.ms, started }; },
        } satisfies HarnessPluginObservation;
      } };
      const order: string[] = [];
      const tree = await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: entries(order), observer });
      expect(order).toEqual(["provider", "consumer", "hi"]);
      expect(asked.map(item => [item.id, item.origin, [...item.provides], [...item.injects]])).toEqual([["provider", "builtin", ["svc"], []], ["consumer", "user", [], ["svc"]]]);
      expect(wrapped.sort()).toEqual(["consumer", "provider"]);
      expect(applied.provider?.ok).toBe(true);
      expect(applied.consumer).toMatchObject({ ok: true, started: 1 });
      expect(applied.consumer.ms).toBeGreaterThanOrEqual(0);
      await tree.dispose();
    } finally { await root.dispose(); }
  });

  it("reports failed and asynchronous applies without changing the error", async () => {
    const root = await createCordisRoot();
    try {
      const results: Record<string, unknown> = {};
      const observer: HarnessMountObserver = { observePlugin: entry => ({ onApplyEnd: result => { results[entry.id] = result; } }) };
      const boom = new Error("boom");
      await expect(mountIsolatedCordisTree({ parent: root.context, sharedServices: [], observer, entries: [
        { id: "slow", config: {}, provides: [], injects: [], module: { apply: async () => { await new Promise(resolve => setTimeout(resolve, 5)); } } },
        { id: "bad", config: {}, provides: [], injects: [], module: { apply: () => { throw boom; } } },
      ] })).rejects.toThrow("boom");
      expect(results.bad).toMatchObject({ ok: false, error: boom });
      expect((results.slow as { ms: number }).ms).toBeGreaterThanOrEqual(4);
    } finally { await root.dispose(); }
  });

  it("lets a skipped plugin through untouched and ignores observer hook failures", async () => {
    const root = await createCordisRoot();
    try {
      const order: string[] = [];
      const observer: HarnessMountObserver = { observePlugin: entry => entry.id === "provider" ? undefined : { onApplyStart: () => { throw new Error("ignored"); }, onApplyEnd: () => { throw new Error("ignored"); } } };
      const tree = await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: entries(order), observer });
      expect(order).toEqual(["provider", "consumer", "hi"]);
      await tree.dispose();
    } finally { await root.dispose(); }
  });
});
