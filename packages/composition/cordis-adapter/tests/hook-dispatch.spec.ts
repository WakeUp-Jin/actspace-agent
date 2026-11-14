import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCordisRoot, onHook, serialDispatch, waterfallDispatch } from "../src/index.js";
import "./fixtures/hook-contracts.js";
import { typeFixture } from "./support/type-fixture.js";

describe("hook dispatch through a real Cordis context", () => {
  it("runs waterfall listeners in registration order, each continuing into the next and finally the built-in behaviour", async () => {
    const root = await createCordisRoot();
    const order: string[] = [];
    try {
      onHook(root.context, "agent/request", async (payload, next) => { order.push(`outer:${payload.model}`); const plan = await next(); return { ...plan, trace: [...(plan.trace ?? []), "outer"] }; });
      onHook(root.context, "agent/request", async (_payload, next) => { order.push("inner"); const plan = await next(); return { ...plan, trace: [...(plan.trace ?? []), "inner"] }; });
      const result = await waterfallDispatch(root.context, "agent/request", { model: "m" }, () => { order.push("built-in"); return { model: "m", trace: ["built-in"] }; });
      expect(order).toEqual(["outer:m", "inner", "built-in"]);
      expect(result).toEqual({ model: "m", trace: ["built-in", "inner", "outer"] });
    } finally {
      await root.dispose();
    }
  });

  it("skips later listeners and the built-in behaviour when a listener answers without continuing", async () => {
    const root = await createCordisRoot();
    const reached: string[] = [];
    try {
      onHook(root.context, "agent/request", () => ({ model: "replaced" }));
      onHook(root.context, "agent/request", (_payload, next) => { reached.push("later listener"); return next(); });
      const result = await waterfallDispatch(root.context, "agent/request", { model: "m" }, () => { reached.push("built-in"); return {}; });
      expect(result).toEqual({ model: "replaced" });
      expect(reached).toEqual([]);
    } finally {
      await root.dispose();
    }
  });

  it("stops at the first serial listener that returns a value", async () => {
    const root = await createCordisRoot();
    const order: string[] = [];
    try {
      onHook(root.context, "agent/turn-stopping", () => { order.push("first"); });
      onHook(root.context, "agent/turn-stopping", (payload) => { order.push("second"); return `handled ${payload.reason}`; });
      onHook(root.context, "agent/turn-stopping", () => { order.push("third"); });
      await expect(serialDispatch(root.context, "agent/turn-stopping", { reason: "completed" })).resolves.toBe("handled completed");
      expect(order).toEqual(["first", "second"]);
    } finally {
      await root.dispose();
    }
  });

  it("stops calling a listener once its registration is disposed", async () => {
    const root = await createCordisRoot();
    const calls: string[] = [];
    try {
      const dispose = onHook(root.context, "agent/turn-stopping", (payload) => { calls.push(payload.reason); });
      await serialDispatch(root.context, "agent/turn-stopping", { reason: "completed" });
      dispose();
      await serialDispatch(root.context, "agent/turn-stopping", { reason: "step-limit" });
      expect(calls).toEqual(["completed"]);
    } finally {
      await root.dispose();
    }
  });

  it("refuses to register on a context that cannot listen", () => {
    expect(() => onHook({}, "agent/request", () => ({}))).toThrow(new Error("Cannot listen to agent/request: this context does not register listeners."));
  });

  it("runs only the built-in behaviour when there is no context to dispatch through", async () => {
    await expect(waterfallDispatch(undefined, "agent/request", { model: "m" }, () => ({ model: "built-in" }))).resolves.toEqual({ model: "built-in" });
    await expect(serialDispatch(undefined, "agent/turn-stopping", { reason: "completed" })).resolves.toBeUndefined();
  });
});

describe("hook dispatch types", () => {
  const fixture = typeFixture(fileURLToPath(new URL("./fixtures/hook-types.ts", import.meta.url)));

  it("compiles the fixture cleanly: every expected error is a real one", () => {
    expect(fixture.expectedErrors).toBe(14);
    expect(fixture.asWritten()).toEqual([]);
  }, 60_000);

  it("rejects each misuse for the intended reason", () => {
    const errors = fixture.withoutDirectives();
    expect(Object.fromEntries(errors.map((error) => [error.label, error.code]))).toEqual({
      "payload-field": 2551,
      "other-payload": 2339,
      "result-type": 2322,
      "forgot-return": 2345,
      "serial-next": 2345,
      "no-contract": 2345,
      "notification": 2345,
      "dispatch-payload": 2322,
      "dispatch-missing": 2345,
      "built-in-result": 2322,
      "waterfall-serial": 2345,
      "serial-waterfall": 2345,
      "dispatch-no-contract": 2345,
      "unchecked-result": 2322,
    });
    expect(errors).toHaveLength(14);
  }, 60_000);
});
