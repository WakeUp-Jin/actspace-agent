import type { ToolCallInput, ToolPreparedEnvironment } from "./prepared-execution.js";
import type { ToolExecutorRegistration, ToolRegistrationHandle } from "./registry.js";
import { ToolRegistry } from "./registry.js";
import type { ToolExecutionResult } from "./result.js";
import { ToolExecutionScheduler } from "./scheduler.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export class ToolRuntime {
  readonly registry: ToolRegistry;
  readonly scheduler: ToolExecutionScheduler;

  constructor(options: { readonly maxParallel?: number; readonly registry?: ToolRegistry } = {}) {
    this.registry = options.registry ?? new ToolRegistry();
    this.scheduler = new ToolExecutionScheduler(this.registry, { maxParallel: options.maxParallel });
  }

  register(registration: ToolExecutorRegistration): ToolRegistrationHandle {
    return this.registry.register(registration);
  }

  executeBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): Promise<readonly ToolExecutionResult[]> {
    return this.scheduler.executeBatch(calls, environment);
  }
}

/** Cordis owner for the tool registry and scheduler; executor bodies stay in providers. */
export class ToolRuntimeService extends Service {
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Tool runtime config must be an object." }] };
      },
    },
  };

  readonly runtime: ToolRuntime;
  readonly registry: ToolRegistry;
  readonly scheduler: ToolExecutionScheduler;

  constructor(ctx: CordisServiceContext, config: { readonly maxParallel?: number } = {}) {
    super(ctx, "tools.runtime");
    this.runtime = new ToolRuntime(config);
    this.registry = this.runtime.registry;
    this.scheduler = this.runtime.scheduler;
    ctx.effect(() => () => undefined, "tools.runtime");
  }

  register(registration: ToolExecutorRegistration): ToolRegistrationHandle { return this.runtime.register(registration); }
  executeBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): Promise<readonly ToolExecutionResult[]> { return this.runtime.executeBatch(calls, environment); }
}
