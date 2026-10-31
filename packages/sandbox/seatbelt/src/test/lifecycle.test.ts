import { CordisContextClass } from "@actspace/cordis-adapter";
import { createNodeSandboxHostPort, SANDBOX_HOST_PORT_ID, SANDBOX_SERVICE_ID, type SandboxBackend, type SandboxService } from "@actspace/sandbox";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";

describe("sandbox-seatbelt plugin lifecycle", () => {
  it("registers its backend with the manager and unregisters on dispose", async () => {
    expect(manifest.behaviors[0]).toMatchObject({ entryId: "sandbox-seatbelt", provides: [], injects: [SANDBOX_SERVICE_ID, SANDBOX_HOST_PORT_ID] });
    expect(() => apply(new CordisContextClass() as never)).toThrow("sandbox-seatbelt requires");
    const registered: SandboxBackend[] = [];
    const sandbox: SandboxService = {
      register: backend => { registered.push(backend); return () => { registered.splice(registered.indexOf(backend), 1); }; },
      status: async () => ({ available: false, isolation: "sandboxed", reasons: [] }),
      run: () => { throw new Error("unused"); },
    };
    const ctx = new CordisContextClass();
    ctx.provide(SANDBOX_SERVICE_ID, sandbox);
    ctx.provide(SANDBOX_HOST_PORT_ID, createNodeSandboxHostPort());
    await ctx.plugin({ inject: [SANDBOX_SERVICE_ID, SANDBOX_HOST_PORT_ID], apply: inner => apply(inner as never) });
    expect(registered.map(backend => backend.id)).toEqual(["seatbelt"]);
    await ctx.fiber.dispose();
    expect(registered).toEqual([]);
  });
});
