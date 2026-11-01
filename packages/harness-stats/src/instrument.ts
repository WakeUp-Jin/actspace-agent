import type { CordisContext, HarnessApplyResult, HarnessMountPluginInfo, HarnessPluginObservation } from "@actspace/cordis-adapter";
import type { HarnessRevisionKey, HarnessRuntimeStatLine } from "@actspace/shared";

type HarnessStatSampleKind = HarnessRuntimeStatLine["kind"];

export type InstrumentHooks = {
  /** Current revision key of the mount this plugin belongs to (read at every call, it changes on activation). */
  readonly revision: () => HarnessRevisionKey;
  readonly record: (sample: { readonly revision: HarnessRevisionKey; readonly kind: HarnessStatSampleKind; readonly plugin: string; readonly name: string; readonly method: string; readonly provider: string | null; readonly ms: number; readonly error: boolean }) => void;
  readonly toolRegistered: (plugin: string, toolName: string, toolPluginId: string | null) => void;
  readonly applied: (plugin: string, result: HarnessApplyResult | undefined) => void;
};

const TOOL_RUNTIME_SERVICE = "tools.runtime";
const INTERNAL_EVENT_PREFIX = "internal/";

function isWrappable(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Promise);
}

/** Builds the per-plugin observation: wraps the services the plugin reads and the listeners it registers. */
export function createPluginObservation(info: HarnessMountPluginInfo, all: readonly HarnessMountPluginInfo[], hooks: InstrumentHooks): HarnessPluginObservation {
  const providers = new Map<string, string>();
  for (const entry of all) for (const service of entry.provides) providers.set(service, entry.id);
  const own = new Set(info.provides);
  // One Proxy per (service object, service name) for this plugin, so `===` between two reads keeps working.
  const proxies = new WeakMap<object, Map<string, object>>();
  const plugin = info.id;

  function measure<T>(kind: HarnessStatSampleKind, name: string, method: string, provider: string | null, run: () => T, onSuccess?: () => void): T {
    const started = performance.now();
    const revision = hooks.revision();
    const done = (error: boolean) => {
      try {
        hooks.record({ revision, kind, plugin, name, method, provider, ms: performance.now() - started, error });
        if (kind === "service" && provider !== null && provider !== plugin) hooks.record({ revision, kind: "dependency", plugin, name: provider, method: name, provider: null, ms: performance.now() - started, error });
        if (!error) onSuccess?.();
      } catch { /* statistics never affect the call */ }
    };
    let result: T;
    try { result = run(); } catch (error) { done(true); throw error; }
    if (result instanceof Promise) return result.then(value => { done(false); return value; }, error => { done(true); throw error; }) as T;
    done(false);
    return result;
  }

  function wrapService(name: string, real: object): object {
    let byName = proxies.get(real);
    if (!byName) proxies.set(real, byName = new Map());
    const known = byName.get(name);
    if (known) return known;
    const provider = providers.get(name) ?? null;
    const methods = new Map<string, { readonly fn: Function; readonly wrapped: Function }>();
    const proxy: object = new Proxy({}, {
      get(_target, prop) {
        const value = Reflect.get(real, prop, real);
        if (typeof value !== "function" || typeof prop !== "string" || prop === "constructor") return value;
        const cached = methods.get(prop);
        if (cached && cached.fn === value) return cached.wrapped;
        const wrapped = new Proxy(value, { apply: (target, thisArg, args) => measure("service", name, prop, provider, () => Reflect.apply(target, thisArg === proxy ? real : thisArg, args), name === TOOL_RUNTIME_SERVICE && prop === "register" ? () => announceTool(args[0]) : undefined) });
        methods.set(prop, { fn: value, wrapped });
        return wrapped;
      },
      has: (_target, prop) => Reflect.has(real, prop),
      ownKeys: () => Reflect.ownKeys(real),
      // Report configurable descriptors: the Proxy target is an empty extensible object, so anything else would violate Proxy invariants.
      getOwnPropertyDescriptor: (_target, prop) => { const descriptor = Reflect.getOwnPropertyDescriptor(real, prop); return descriptor ? { ...descriptor, configurable: true } : undefined; },
      set: (_target, prop, value) => Reflect.set(real, prop, value, real),
      deleteProperty: (_target, prop) => Reflect.deleteProperty(real, prop),
      getPrototypeOf: () => Reflect.getPrototypeOf(real),
    });
    byName.set(name, proxy);
    return proxy;
  }
  function announceTool(registration: unknown): void {
    const definition = (registration as { readonly definition?: { readonly name?: unknown; readonly pluginId?: unknown } } | undefined)?.definition;
    if (typeof definition?.name !== "string") return;
    hooks.toolRegistered(plugin, definition.name, typeof definition.pluginId === "string" ? definition.pluginId : null);
  }
  function wrapListener(event: string, listener: unknown): unknown {
    if (typeof listener !== "function" || event.startsWith(INTERNAL_EVENT_PREFIX)) return listener;
    return function (this: unknown, ...args: unknown[]) { return measure("listener", event, "", null, () => Reflect.apply(listener, this, args)); };
  }

  return {
    wrapContext(ctx: CordisContext): CordisContext {
      const isService = (target: object, prop: string): boolean => {
        const props = (target as { readonly reflect?: { readonly props?: Record<string, { readonly type?: string } | undefined> } }).reflect?.props;
        return props?.[prop]?.type === "service";
      };
      return new Proxy(ctx as object, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof prop !== "string") return value;
          if (typeof value === "function") {
            if (prop === "get") return function (this: unknown, name: unknown, ...rest: unknown[]) {
              const service = Reflect.apply(value, this ?? receiver, [name, ...rest]);
              return typeof name === "string" && !own.has(name) && isWrappable(service) ? wrapService(name, service) : service;
            };
            if (prop === "on" || prop === "once") return function (this: unknown, event: unknown, listener: unknown, ...rest: unknown[]) {
              return Reflect.apply(value, this ?? receiver, [event, typeof event === "string" ? wrapListener(event, listener) : listener, ...rest]);
            };
            return value;
          }
          if (isWrappable(value) && !own.has(prop) && isService(target, prop)) return wrapService(prop, value);
          return value;
        },
      }) as CordisContext;
    },
    onApplyEnd: result => hooks.applied(plugin, result),
  };
}
