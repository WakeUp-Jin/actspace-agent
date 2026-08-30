import { CordisService } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export const SERVICE_FIXTURE_IDS = Object.freeze({
  dependency: "fixture.dependency",
  probe: "fixture.probe",
  config: "fixture.config",
  failure: "fixture.failure",
});

type Config = { readonly enabled?: boolean };

export type ServiceFixtureConstructor = new (ctx: CordisServiceContext, config?: Config) => CordisService;
export type ServiceLifecycleFixtures = Readonly<{
  readonly events: string[];
  readonly DependencyService: ServiceFixtureConstructor;
  readonly ProbeService: ServiceFixtureConstructor;
  readonly ConfigService: ServiceFixtureConstructor;
  readonly FailingService: ServiceFixtureConstructor;
}>;

/** Small real-Cordis classes reused by Service ABI contract tests. */
export function createServiceLifecycleFixtures(): ServiceLifecycleFixtures {
  const events: string[] = [];

  class DependencyService extends CordisService {
    constructor(ctx: CordisServiceContext) {
      super(ctx, SERVICE_FIXTURE_IDS.dependency);
    }
  }

  class ProbeService extends CordisService {
    static inject = Object.freeze([SERVICE_FIXTURE_IDS.dependency]);

    constructor(ctx: CordisServiceContext, config: Config = {}) {
      super(ctx, SERVICE_FIXTURE_IDS.probe);
      events.push(`probe:active:${config.enabled === false ? "disabled" : "enabled"}`);
      ctx.effect(() => () => { events.push("probe:disposed"); }, "fixture.probe");
    }
  }

  class ConfigService extends CordisService {
    static Config = {
      "~standard": {
        version: 1,
        vendor: "actspace.test",
        validate(value: unknown) {
          if (value !== null && typeof value === "object" && (value as Config).enabled === true) return { value };
          return { issues: [{ message: "enabled must be true", path: ["enabled"] }] };
        },
      },
    };

    constructor(ctx: CordisServiceContext, _config: Config = {}) {
      super(ctx, SERVICE_FIXTURE_IDS.config);
    }
  }

  class FailingService extends CordisService {
    constructor(ctx: CordisServiceContext) {
      super(ctx, SERVICE_FIXTURE_IDS.failure);
      throw new Error("fixture startup failure");
    }
  }

  return Object.freeze({ events, DependencyService, ProbeService, ConfigService, FailingService });
}
