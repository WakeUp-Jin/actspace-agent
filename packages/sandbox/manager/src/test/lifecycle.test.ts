import { CordisContextClass } from "@actspace/cordis-adapter";
import { manifest } from "../manifest.js";
import { createNodeSandboxHostPort } from "../node-ports.js";
import { apply } from "../plugin.js";
import { SANDBOX_HOST_PORT_ID, SANDBOX_SERVICE_ID, type SandboxService } from "../types.js";

describe("sandbox plugin lifecycle", () => {
  it("provides the service from the Host port and retracts it on dispose", async () => {
    expect(manifest.behaviors[0]).toMatchObject({ entryId: "sandbox", provides: ["sandbox"], injects: [SANDBOX_HOST_PORT_ID] });
    const ctx = new CordisContextClass();
    expect(() => apply(ctx as never)).toThrow(SANDBOX_HOST_PORT_ID);
    ctx.provide(SANDBOX_HOST_PORT_ID, createNodeSandboxHostPort());
    await ctx.plugin({ inject: [SANDBOX_HOST_PORT_ID], apply: inner => apply(inner as never) });
    const service = ctx.get(SANDBOX_SERVICE_ID) as SandboxService;
    // No backend plugin is loaded, so the manager refuses rather than running unsandboxed.
    expect(await service.status("tool")).toMatchObject({ available: false, isolation: "sandboxed" });
    await ctx.fiber.dispose();
    expect(ctx.get(SANDBOX_SERVICE_ID)).toBeUndefined();
  });

  it("rejects an unknown mode", () => {
    const ctx = new CordisContextClass();
    ctx.provide(SANDBOX_HOST_PORT_ID, createNodeSandboxHostPort());
    expect(() => apply(ctx as never, { mode: "off" as never })).toThrow("Invalid sandbox mode");
  });
});
