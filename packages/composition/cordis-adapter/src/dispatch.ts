import type { CordisContext } from "./cordis-types.js";
import type { AgentLoopIntervention, AgentNotification } from "./event-contract.js";

export type DispatchCarrier = object;

/** Publish through native Cordis emit. Observers own their asynchronous work. */
export function emitNotification(context: CordisContext | undefined, type: AgentNotification | string, payload: unknown, carrier?: DispatchCarrier): void {
  const args: unknown[] = carrier === undefined ? [type, payload] : [carrier, type, payload];
  context?.emit?.(...args);
}

/** Isolate notification observers at registration, preserving Cordis' carrier. */
export function containNotification<T, A extends unknown[]>(context: CordisContext, listener: (this: T, ...args: A) => unknown): (this: T, ...args: A) => void {
  const report = (error: unknown): void => {
    try { context.logger?.error("Notification observer failed: %s", error); }
    catch { /* A diagnostic exporter must not turn an observation into a failure. */ }
  };
  return function (this: T, ...args: A): void {
    try {
      const result = listener.apply(this, args);
      if (result !== undefined && result !== null && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch(report);
      }
    } catch (error) { report(error); }
  };
}

/** Run an intervention with Cordis' true continuation-based waterfall semantics. */
export async function waterfallDispatch<T, R = T>(context: CordisContext | undefined, type: AgentLoopIntervention | string, payload: T, next: () => R | Promise<R>, carrier?: DispatchCarrier): Promise<T | R> {
  if (context?.waterfall === undefined) return next();
  const args: unknown[] = carrier !== undefined && context.events?.dispatch !== undefined ? [carrier, type, payload, next] : [type, payload, next];
  const result = await Promise.resolve(context.waterfall(...args));
  return result as T | R;
}

/** Run serial listeners and preserve Cordis' bail result for callers that need it. */
export async function serialDispatch(context: CordisContext | undefined, type: AgentLoopIntervention | string, payload: unknown, carrier?: DispatchCarrier): Promise<unknown> {
  if (context?.serial === undefined) return undefined;
  const args: unknown[] = carrier !== undefined && context.events?.dispatch !== undefined ? [carrier, type, payload] : [type, payload];
  return context.serial(...args);
}
