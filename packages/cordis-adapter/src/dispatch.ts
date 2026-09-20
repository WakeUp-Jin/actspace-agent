import type { CordisContext } from "./cordis-types.js";
import type { AgentLoopIntervention, AgentNotification } from "./event-contract.js";

export type DispatchCarrier = object;

/** Run a required event and fail when no handler or a handler fails. */
export async function requiredDispatch(context: CordisContext | undefined, type: string, payload: unknown, carrier?: DispatchCarrier): Promise<void> {
  if (context === undefined) throw new Error(`Required event "${type}" has no dispatch context.`);
  if (context.events?.dispatch === undefined) {
    if (context.parallel === undefined) throw new Error(`Required event "${type}" has no dispatch context.`);
    await context.parallel(type, payload);
    return;
  }
  const args: unknown[] = carrier === undefined ? [type, payload] : [carrier, type, payload];
  const callbacks = context.events.dispatch("emit", args);
  if (callbacks.length === 0) throw new Error(`Required event "${type}" has no handler.`);
  const results = await Promise.allSettled(callbacks.map((callback) => Promise.resolve().then(() => callback(...args))));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure !== undefined) throw failure.reason;
}

/** Notify every matching listener while isolating observer failures. */
export async function emitContained(context: CordisContext | undefined, type: AgentNotification | string, payload: unknown, carrier?: DispatchCarrier): Promise<void> {
  if (context === undefined) return;
  const args: unknown[] = carrier === undefined ? [type, payload] : [carrier, type, payload];
  const callbacks = context.events?.dispatch?.("emit", args);
  if (callbacks !== undefined) {
    await Promise.allSettled(callbacks.map((callback) => Promise.resolve().then(() => callback(...args))));
    return;
  }
  try { await Promise.resolve(context.parallel?.(type, payload)); }
  catch { /* notifications never block the durable path */ }
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
