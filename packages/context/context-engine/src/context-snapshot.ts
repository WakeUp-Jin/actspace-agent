import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { isTrustedSurfaceView } from "@actspace/session-journal";
import { freezeRequest } from "./request-snapshot.js";
import type { Context } from "./types.js";

// Only snapshots validated and detached here may be shared. Object.isFrozen on
// caller-owned data alone is not sufficient (children may still be mutable).
const trusted = new WeakSet<object>();
function remember(value: unknown): void {
  // 已信任的对话视图不走进去：它由日志保证只读，逐个登记节点等于每次遍历整段对话。
  if (value === null || typeof value !== "object" || trusted.has(value) || isTrustedSurfaceView(value)) return;
  trusted.add(value);
  for (const child of Object.values(value)) remember(child);
}
export function contextValue<T>(value: T): T {
  if (value !== null && typeof value === "object" && trusted.has(value)) return value;
  // 日志交出的对话视图入日志时已校验、深度冻结，直接引用（agent-spec-context-trusted-surface.md §3.2）。
  if (isTrustedSurfaceView(value)) return value;
  if (isPlainObject(value) && Object.values(value).some(isTrustedSurfaceView)) return withTrustedChildren(value) as T;
  const frozen = freezeRequest(value as RuntimeJsonValue) as T;
  remember(frozen);
  return frozen;
}

/**
 * 源交来的 `{ conversation: 视图 }`、组装中间的 content 这类一层包装：已信任的子项原样引用，
 * 其余子项照旧检查、复制、冻结；键名（含密钥字段检查）和键顺序与整份 freezeRequest 相同。
 */
function withTrustedChildren(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const probe = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, isTrustedSurfaceView(child) ? null : child]));
  const checked = freezeRequest(probe as RuntimeJsonValue) as Readonly<Record<string, RuntimeJsonValue>>;
  const result = Object.freeze(Object.fromEntries(Object.keys(checked).map(key => [key, isTrustedSurfaceView(value[key]) ? value[key] : checked[key]])));
  remember(result);
  return result;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** 已经过日志或本模块检查、冻结的值（toLlmInput 据此决定要不要再查一遍消息）。 */
export function isCheckedContextValue(value: unknown): boolean {
  return isTrustedSurfaceView(value) || (value !== null && typeof value === "object" && trusted.has(value));
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
