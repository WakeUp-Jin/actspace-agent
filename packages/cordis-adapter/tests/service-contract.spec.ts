import { describe, expect, it } from "vitest";
import {
  ACTSPACE_SERVICE_DEFINITIONS,
  ACTSPACE_SERVICE_IDS,
  ACTSPACE_SERVICE_ROLE_METADATA,
  CordisContextClass,
  CordisService,
  type CordisServiceContext,
  defineServiceDefinition,
  defineBuiltinPluginManifest,
  validatePluginManifest,
} from "../src/index.js";
import { createServiceLifecycleFixtures, SERVICE_FIXTURE_IDS } from "./fixtures/service-fixtures.js";

describe("Cordis Service ABI", () => {
  it("describes real Cordis services without a second provider registry", () => {
    expect(ACTSPACE_SERVICE_IDS.sessionStore).toBe("session.store");
    expect(ACTSPACE_SERVICE_DEFINITIONS.agentLoop.id).toBe("agent.loop");
    expect(ACTSPACE_SERVICE_ROLE_METADATA.find(role => role.definitionId === "session.storage")?.providerId).toBe("session.storage:jsonl");
  });

  it("rejects manifest service declarations that drift from behavior metadata", () => {
    const manifest = defineBuiltinPluginManifest({
      pluginId: "fixture.service-manifest",
      version: "1.0.0",
      name: "fixture",
      entry: { entryId: "fixture.service", behavior: "./plugin.js" },
      host: { required: [], optional: [] },
      frontend: null,
      contributions: { services: ["fixture.service"], tools: [], prompts: [], events: [] },
    });
    expect(() => validatePluginManifest(manifest)).not.toThrow();
    const drifted = Object.freeze({ ...manifest, contributions: Object.freeze({ ...manifest.contributions, services: ["fixture.other"] }) });
    expect(() => validatePluginManifest(drifted)).toThrow(/undeclared service/);
    const second = defineBuiltinPluginManifest({ pluginId: "fixture.second", version: "1", name: "second", entry: { entryId: "fixture.second", behavior: "./second.js", enabled: false }, host: { required: [], optional: [] }, frontend: null, contributions: { services: ["fixture.second"], tools: [], prompts: [], events: [] } });
    expect(() => validatePluginManifest({ ...manifest, behaviors: [...manifest.behaviors, ...second.behaviors], contributions: { ...manifest.contributions, services: ["fixture.service", "fixture.second"] } })).not.toThrow();
    expect(() => validatePluginManifest({ ...manifest, contributions: { ...manifest.contributions, services: ["fixture.service", "fixture.unowned"] } })).toThrow(/without a behavior provider/);
  });

  it("registers a real Service and disposes its ctx.effect exactly once", async () => {
    const fixture = createServiceLifecycleFixtures();
    const ctx = new CordisContextClass();
    await ctx.plugin(fixture.DependencyService);
    await ctx.plugin(fixture.ProbeService, { enabled: true });

    expect(ctx.get(SERVICE_FIXTURE_IDS.probe)).toBeDefined();
    expect(fixture.events).toEqual(["probe:active:enabled"]);
    await ctx.fiber.dispose();
    await ctx.fiber.dispose();
    expect(fixture.events).toEqual(["probe:active:enabled", "probe:disposed"]);
  });

  it("keeps a missing required injection pending instead of constructing a partial Service", async () => {
    const fixture = createServiceLifecycleFixtures();
    const ctx = new CordisContextClass();
    const fiber = ctx.plugin(fixture.ProbeService, { enabled: true });

    // Cordis intentionally exports FiberState as a const enum in its types;
    // the public runtime state value for PENDING is 0.
    expect(fiber.state).toBe(0);
    expect(ctx.get(SERVICE_FIXTURE_IDS.probe)).toBeUndefined();
    expect(fixture.events).toEqual([]);
    await ctx.fiber.dispose();
  });

  it("fails closed for invalid Config and apply errors", async () => {
    const fixture = createServiceLifecycleFixtures();
    const configContext = new CordisContextClass();
    await expect(configContext.plugin(fixture.ConfigService, { enabled: false })).rejects.toThrow(/enabled must be true/);
    await configContext.fiber.dispose();

    const failureContext = new CordisContextClass();
    await expect(failureContext.plugin(fixture.FailingService)).rejects.toThrow(/fixture startup failure/);
    expect(failureContext.get(SERVICE_FIXTURE_IDS.failure)).toBeUndefined();
    await failureContext.fiber.dispose();
  });

  it("keeps a dependency cycle unresolved instead of constructing either Service", async () => {
    class CycleA extends CordisService {
      static inject = Object.freeze(["fixture.cycle.b"]);
      constructor(ctx: CordisServiceContext) { super(ctx, "fixture.cycle.a"); }
    }
    class CycleB extends CordisService {
      static inject = Object.freeze(["fixture.cycle.a"]);
      constructor(ctx: CordisServiceContext) { super(ctx, "fixture.cycle.b"); }
    }
    const ctx = new CordisContextClass();
    const first = ctx.plugin(CycleA);
    const second = ctx.plugin(CycleB);
    expect(first.state).toBe(0);
    expect(second.state).toBe(0);
    expect(ctx.get("fixture.cycle.a")).toBeUndefined();
    expect(ctx.get("fixture.cycle.b")).toBeUndefined();
    await ctx.fiber.dispose();
  });
});
