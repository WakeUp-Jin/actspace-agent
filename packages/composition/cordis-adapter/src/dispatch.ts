import type { CordisContext } from "./cordis-types.js";
import type {
  AgentNotification,
  DomainEvents,
  HookName,
  HookPayload,
  HookResult,
  SerialHookName,
  WaterfallHookName,
} from "./event-contract.js";

export type DispatchCarrier = object;

/** Publish through native Cordis emit. Observers own their asynchronous work. */
export function emitNotification(
  context: CordisContext | undefined,
  type: AgentNotification | string,
  payload: unknown,
  carrier?: DispatchCarrier,
): void {
  const args: unknown[] = carrier === undefined ? [type, payload] : [carrier, type, payload];
  context?.emit?.(...args);
}

/** Isolate notification observers at registration, preserving Cordis' carrier. */
export function containNotification<T, A extends unknown[]>(
  context: CordisContext,
  listener: (this: T, ...args: A) => unknown,
): (this: T, ...args: A) => void {
  const report = (error: unknown): void => {
    try {
      context.logger?.error("Notification observer failed: %s", error);
    } catch {
      /* A diagnostic exporter must not turn an observation into a failure. */
    }
  };
  return function (this: T, ...args: A): void {
    try {
      const result = listener.apply(this, args);
      if (result !== undefined && result !== null && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch(report);
      }
    } catch (error) {
      report(error);
    }
  };
}

/**
 * 给干预点注册监听器，返回注销函数。payload、`next()` 和返回值的类型都从干预点的契约来，监听器不用自己标。
 * 干预点会改变执行结果：context 不能注册监听器时报错，不装作注册成功。
 */
export function onHook<K extends HookName>(context: CordisContext, name: K, listener: DomainEvents[K]): () => void {
  if (context.on === undefined) throw new Error(`Cannot listen to ${name}: this context does not register listeners.`);
  const dispose = context.on(name, listener);
  return () => {
    if (typeof dispose === "function") dispose();
  };
}

/**
 * Run an intervention with Cordis' true continuation-based waterfall semantics.
 * payload 和内置行为 `next` 的类型由干预点的契约决定。返回 `unknown`：监听器来自单独构建的插件，
 * 编译期的类型约束不到运行时拿到的值，分发方检查之后再用。
 */
export async function waterfallDispatch<K extends WaterfallHookName>(
  context: CordisContext | undefined,
  type: K,
  payload: HookPayload<K>,
  next: () => HookResult<K> | Promise<HookResult<K>>,
  carrier?: DispatchCarrier,
): Promise<unknown> {
  if (context?.waterfall === undefined) return next();
  const args: unknown[] =
    carrier !== undefined && context.events?.dispatch !== undefined
      ? [carrier, type, payload, next]
      : [type, payload, next];
  return await Promise.resolve(context.waterfall(...args));
}

/** Run serial listeners and preserve Cordis' bail result for callers that need it. */
export async function serialDispatch<K extends SerialHookName>(
  context: CordisContext | undefined,
  type: K,
  payload: HookPayload<K>,
  carrier?: DispatchCarrier,
): Promise<unknown> {
  if (context?.serial === undefined) return undefined;
  const args: unknown[] =
    carrier !== undefined && context.events?.dispatch !== undefined ? [carrier, type, payload] : [type, payload];
  return context.serial(...args);
}
