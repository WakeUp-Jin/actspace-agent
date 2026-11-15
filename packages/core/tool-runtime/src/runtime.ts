import type { ToolCallInput, ToolPreparedEnvironment } from "./prepared-execution.js";
import type { ToolExecutorRegistration, ToolRegistrationHandle } from "./registry.js";
import { ToolRegistry } from "./registry.js";
import type { ToolExecutionResult } from "./result.js";
import { ToolExecutionScheduler } from "./scheduler.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";
import { TOOL_RUNTIME_SERVICE } from "./service-keys.js";

export class ToolRuntime {
  readonly registry: ToolRegistry;
  readonly scheduler: ToolExecutionScheduler;
  readonly #agentBindings = new WeakMap<object, { readonly sessionId: string; readonly agentId: string; readonly allowed: () => ReadonlySet<string> }>();
  /** Latest live binding per Agent, so a tool can read what its caller may use. */
  readonly #latestBindings = new Map<string, object>();

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
    const key = bindingKey(sessionId, agentId);
    this.#agentBindings.set(token, { sessionId, agentId, allowed });
    this.#latestBindings.set(key, token);
    return Object.freeze({ token, dispose: () => {
      this.#agentBindings.delete(token);
      if (this.#latestBindings.get(key) === token) this.#latestBindings.delete(key);
    } });
  }

  /** Tool names the Agent's live binding allows right now; undefined when it has none. */
  allowedToolNames(sessionId: string, agentId: string): ReadonlySet<string> | undefined {
    const token = this.#latestBindings.get(bindingKey(sessionId, agentId));
    return token === undefined ? undefined : this.#agentBindings.get(token)?.allowed();
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

/**
 * `ToolRuntime` 的公开成员。`tools.runtime` 下注册的是包装服务，不是 `ToolRuntime` 本身（类带私有字段，
 * 包装服务不算它的实例），所以取用方的参数写这个类型：两者都满足。
 */
export type ToolRuntimeContract = Pick<ToolRuntime, keyof ToolRuntime>;

/** Cordis owner for the tool registry and scheduler; executor bodies stay in providers. */
export class ToolRuntimeService extends Service implements ToolRuntimeContract {
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
    super(ctx, TOOL_RUNTIME_SERVICE.id);
    this.runtime = new ToolRuntime({ ...config, requireAgentScope: true });
    this.registry = this.runtime.registry;
    this.scheduler = this.runtime.scheduler;
  }

  register(registration: ToolExecutorRegistration): ToolRegistrationHandle { return this.runtime.register(registration); }
  bindAgentScope(sessionId: string, agentId: string, allowed: () => ReadonlySet<string>) { return this.runtime.bindAgentScope(sessionId, agentId, allowed); }
  allowedToolNames(sessionId: string, agentId: string): ReadonlySet<string> | undefined { return this.runtime.allowedToolNames(sessionId, agentId); }
  executeBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): Promise<readonly ToolExecutionResult[]> { return this.runtime.executeBatch(calls, environment); }
}

function bindingKey(sessionId: string, agentId: string): string { return `${sessionId}\u0000${agentId}`; }
