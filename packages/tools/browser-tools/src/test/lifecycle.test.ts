import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("browser tools plugin", () => {
  it("publishes browser registration behavior", async () => {
    const activation = activate();
    expect(activation.services?.["tools.browser"]).toMatchObject({ registerBrowserTools: expect.any(Function) });
    await activation.dispose();
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
