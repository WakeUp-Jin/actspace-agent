import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { freezeRequest } from "./request-snapshot.js";
import type { Context } from "./types.js";

// Only snapshots validated and detached here may be shared. Object.isFrozen on
// caller-owned data alone is not sufficient (children may still be mutable).
const trusted = new WeakSet<object>();
function remember(value: unknown): void {
  if (value === null || typeof value !== "object" || trusted.has(value)) return;
  trusted.add(value);
  for (const child of Object.values(value)) remember(child);
}
export function contextValue<T>(value: T): T {
  if (value !== null && typeof value === "object" && trusted.has(value)) return value;
  const frozen = freezeRequest(value as RuntimeV2JsonValue) as T;
  remember(frozen);
  return frozen;
}

/** Detach new slices once; preserve validated immutable module output. */
export function freezeContextView(context: Context): Context {
  const system = Object.freeze({
    sections: Object.freeze(context.content.system.sections.map(section => contextValue(section))),
    modelFacts: Object.freeze(context.content.system.modelFacts.map(fact => contextValue(fact))),
    ...(context.content.system.modelFactSources ? { modelFactSources: contextValue(context.content.system.modelFactSources) } : {}),
  });
  remember(system);
  const view = Object.freeze({
    request: contextValue(context.request),
    content: Object.freeze({ system, conversation: contextValue(context.content.conversation),
      supplements: Object.freeze(context.content.supplements.map(value => contextValue(value))), tools: contextValue(context.content.tools) }),
    status: contextValue(context.status),
  });
  remember(view);
  return view;
}
