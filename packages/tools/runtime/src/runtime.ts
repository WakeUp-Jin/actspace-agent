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
  readonly #agentBindings = new WeakMap<object, { readonly sessionId: string; readonly agentId: string; readonly allowed: () => ReadonlySet<string> }>();

  constructor(options: { readonly maxParallel?: number; readonly registry?: ToolRegistry; readonly requireAgentScope?: boolean } = {}) {
    this.registry = options.registry ?? new ToolRegistry();
    this.scheduler = new ToolExecutionScheduler(this.registry, { maxParallel: options.maxParallel });
    this.requireAgentScope = options.requireAgentScope ?? false;
  }
  private readonly requireAgentScope: boolean;

  register(registration: ToolExecutorRegistration): ToolRegistrationHandle {
    return this.registry.register(registration);
  }

  bindAgentScope(sessionId: string, agentId: string, allowed: () => ReadonlySet<string>): { readonly token: object; readonly dispose: () => void } {
    const token = Object.freeze({});
    this.#agentBindings.set(token, { sessionId, agentId, allowed });
    return Object.freeze({ token, dispose: () => { this.#agentBindings.delete(token); } });
  }

  executeBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): Promise<readonly ToolExecutionResult[]> {
    if (!this.requireAgentScope) return this.scheduler.executeBatch(calls, environment);
    const binding = environment.agentScopeToken === undefined ? undefined : this.#agentBindings.get(environment.agentScopeToken);
    if (binding === undefined || calls.some(call => call.sessionId !== binding.sessionId || call.agentId !== binding.agentId)) {
      throw new Error("Tool execution requires a matching Agent scope policy.");
    }
    const permitted = binding.allowed();
    const allowedToolNames = new Set([...permitted].filter(name => environment.allowedToolNames?.has(name) ?? true));
    return this.scheduler.executeBatch(calls, { ...environment, allowedToolNames, isToolAllowedNow: name => binding.allowed().has(name) && (environment.isToolAllowedNow?.(name) ?? true) });
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
    this.runtime = new ToolRuntime({ ...config, requireAgentScope: true });
    this.registry = this.runtime.registry;
    this.scheduler = this.runtime.scheduler;
    ctx.effect(() => () => undefined, "tools.runtime");
  }

  register(registration: ToolExecutorRegistration): ToolRegistrationHandle { return this.runtime.register(registration); }
  bindAgentScope(sessionId: string, agentId: string, allowed: () => ReadonlySet<string>) { return this.runtime.bindAgentScope(sessionId, agentId, allowed); }
  executeBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): Promise<readonly ToolExecutionResult[]> { return this.runtime.executeBatch(calls, environment); }
}
