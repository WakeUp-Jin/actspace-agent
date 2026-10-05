import { ToolRuntime } from "@actspace/tools-runtime";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("browser tools plugin", () => {
  it("publishes browser registration behavior", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("tools.runtime", new ToolRuntime());
    ctx.provide("actspace.host.tools.browser", { ready: false, dispose: async () => undefined });
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("tools.browser")).toMatchObject({ available: false, registrations: [] });
    await ctx.fiber.dispose();
  });
});

it("allows Harness retirement to leave the Host-owned browser alive", async () => {
  const { apply } = await import("../plugin.js");
  const { ToolRuntime } = await import("@actspace/tools-runtime");
  let closed = 0; const cleanup: Array<() => unknown> = [];
  apply({ get: name => name === "tools.runtime" ? new ToolRuntime() : { ready: false, dispose: async () => { closed++; } }, provide: () => undefined, effect: factory => { cleanup.push(factory() as () => unknown); return () => undefined; } }, { disposeHost: false });
  for (const dispose of cleanup) await dispose();
  expect(closed).toBe(0);
});
