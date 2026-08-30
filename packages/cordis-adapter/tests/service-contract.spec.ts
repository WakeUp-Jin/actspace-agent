import { describe, expect, it } from "vitest";
import {
  ACTSPACE_SERVICE_DEFINITIONS,
  ACTSPACE_SERVICE_IDS,
  ACTSPACE_SERVICE_ROLE_METADATA,
  CordisContextClass,
  CordisService,
  type CordisServiceContext,
  defineServiceConsumer,
  defineServiceProvider,
  defineServiceDefinition,
  validateServiceDefinition,
  validateServiceGraph,
  defineBuiltinPluginManifest,
  validateManifestServiceConsistency,
  requireService,
} from "../src/index.js";
import { createServiceLifecycleFixtures, SERVICE_FIXTURE_IDS } from "../../test-support/src/service-fixtures.js";

describe("Cordis Service ABI", () => {
  it("keeps stable ids and separates Definition, Provider and Consumer roles", () => {
    const definition = defineServiceDefinition<{ value: number }, { enabled: boolean }>({ id: "fixture.definition", description: "fixture" });
    const provider = defineServiceProvider({ definition, create: async () => ({ value: 1 }) });
    const consumer = defineServiceConsumer({ definition, requires: ["fixture.definition"], consume: () => undefined });

    expect(ACTSPACE_SERVICE_IDS.sessionStore).toBe("session.store");
    expect(ACTSPACE_SERVICE_DEFINITIONS.agentLoop.id).toBe("agent.loop");
    expect(ACTSPACE_SERVICE_ROLE_METADATA.length).toBeGreaterThanOrEqual(14);
    expect(ACTSPACE_SERVICE_ROLE_METADATA.find((role) => role.definitionId === "session.persistence")?.providerId).toBe("session.persistence:jsonl");
    expect(provider.kind).toBe("actspace.service-provider");
    expect(provider.providerId).toBe("fixture.definition:default");
    expect(consumer.kind).toBe("actspace.service-consumer");
    expect(definition.abiVersion).toBe(1);
    expect(definition.owner).toBe("@actspace/core");
    expect(consumer.requires).toEqual(["fixture.definition"]);
    expect(() => requireService(new CordisContextClass(), "fixture.missing")).toThrow(/fixture\.missing/);
  });

  it("validates provider ownership and required graph entries fail closed", async () => {
    const definition = defineServiceDefinition<{ value: number }, Record<string, never>>({ id: "fixture.graph", description: "graph", required: true, owner: "@actspace/test" });
    const provider = defineServiceProvider({ definition, create: async () => ({ value: 1 }) });
    validateServiceGraph({ definitions: [definition], providers: [provider] });
    const handle = await provider.apply(new CordisContextClass(), {});
    expect(handle.service).toEqual({ value: 1 });
    await handle.dispose();

    expect(() => validateServiceGraph({ definitions: [definition], providers: [] })).toThrow(/no provider/);
    expect(() => validateServiceGraph({ definitions: [definition], providers: [provider, provider] })).toThrow(/Multiple active providers/);
    expect(() => validateServiceDefinition({ ...definition, owner: "" })).toThrow(/owner/);
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
    expect(() => validateManifestServiceConsistency(manifest)).not.toThrow();
    const drifted = Object.freeze({ ...manifest, contributions: Object.freeze({ ...manifest.contributions, services: ["fixture.other"] }) });
    expect(() => validateManifestServiceConsistency(drifted)).toThrow(/undeclared service/);
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
