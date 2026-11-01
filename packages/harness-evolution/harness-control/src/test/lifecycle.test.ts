import { expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { apply } from "../plugin.js";
import { manifest } from "../manifest.js";
it("declares its Host dependency and refuses activation without it", async () => {
  expect(manifest.behaviors[0]?.injects).toContain("actspace.host.harness-control");
  const context = new CordisContextClass();
  try { await expect(apply(context as never)).rejects.toThrow("Host options"); expect(context.get("harness.control")).toBeUndefined(); }
  finally { await context.fiber.dispose(); }
});

it("publishes the standard Cordis service and releases its writer lease with plugin disposal", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createCordisRoot } = await import("@actspace/cordis-adapter");
  const { composeRuntime } = await import("@actspace/composition");
  const { HarnessControl } = await import("../service.js");
  const path = await mkdtemp(join(tmpdir(), "harness-plugin-"));
  const root = await createCordisRoot();
  const options = { dataRoot: path, artifactRoot: join(path, "artifacts"), runtimeId: "lifecycle", compatibility: { services: [], events: [], sharedModules: [], codecArtifacts: [] }, sharedServices: [], builtin: async () => ({ composition: composeRuntime({ profile: { id: "empty-test", runtimeContract: "actspace.runtime.v2", orderedBundleIds: [] }, bundles: [], hostCapabilities: [] }), artifacts: new Map(), sharedServices: [] }) };
  try {
    await root.mount("host", ctx => ctx.provide("actspace.host.harness-control", options), { provides: ["actspace.host.harness-control"] });
    await root.mount("control", scope => apply(scope.context), { inject: ["actspace.host.harness-control"] });
    const service = root.context.get!("harness.control") as InstanceType<typeof HarnessControl>;
    expect(service.inspect().current?.revision).toBe(1);
    await root.dispose();
    const nextRoot = await createCordisRoot();
    const next = new HarnessControl({ ...options, context: nextRoot.context });
    try { await next.initialize(); expect(next.inspect().blocked).toBe(""); expect(next.inspect().current?.revision).toBe(1); }
    finally { await next.close(); await nextRoot.dispose(); }
  } finally { await root.dispose(); await rm(path, { recursive: true, force: true }); }
});
