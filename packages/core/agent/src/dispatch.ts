import type {
  CordisContext,
  HookName,
  HookPayload,
  HookResult,
  SerialHookName,
  WaterfallHookName,
} from "@actspace/cordis-adapter";
import { emitNotification, serialDispatch, waterfallDispatch, type DispatchCarrier } from "@actspace/cordis-adapter";
import {
  carrierKeyOf,
  isScopeCarrier,
  scopeActiveOf,
  scopeTarget,
  type AgentScope,
  type ScopeKey,
} from "@actspace/scope";

/** Live Agent subject carried by Agent-subject events. */
export type AgentSubject = Readonly<Record<string, unknown>> & {
  readonly agentId: string;
  readonly scopeId: string;
};

export type AgentEventPayload = Readonly<Record<string, unknown>>;

/** 以 Agent 为主体的干预点：契约的 payload 里有 `agent`。工具的干预点没有，不从这里分发。 */
export type AgentHookName = {
  [K in HookName]: HookPayload<K> extends { readonly agent: AgentSubject } ? K : never;
}[HookName];
/** 分发方交给 dispatcher 的内容：契约的 payload 去掉 `agent`，`agent` 由 dispatcher 填。 */
export type AgentHookInput<K extends AgentHookName> = Omit<HookPayload<K>, "agent">;

export interface AgentEventDispatcher {
  readonly subject: AgentSubject;
  readonly scopeKey: ScopeKey;
  readonly carrier: DispatchCarrier;
  emit(type: string, payload?: AgentEventPayload): void;
  /** 结果是 `unknown`，见 `serialDispatch`。 */
  serial<K extends AgentHookName & SerialHookName>(type: K, payload: AgentHookInput<K>): Promise<unknown>;
  /** `next` 是内置行为。结果是 `unknown`：监听器来自插件，分发方检查之后再用。 */
  waterfall<K extends AgentHookName & WaterfallHookName>(
    type: K,
    payload: AgentHookInput<K>,
    next: () => HookResult<K> | Promise<HookResult<K>>,
  ): Promise<unknown>;
}

/** Create the single fused subject/carrier dispatcher for one live Agent. */
export function createAgentEventDispatcher(
  context: CordisContext | undefined,
  scope: AgentScope,
  subject: AgentSubject = defaultAgentSubject(scope),
): AgentEventDispatcher {
  if (subject.agentId !== scope.agentId || subject.scopeId !== scope.identity.scopeId) {
    throw new Error("Agent subject does not match its Scope identity.");
  }
  const scopeKey = scope.scopeKey;
  const carrier = scopeTarget(subject, scopeKey);
  if (!isScopeCarrier(carrier) || carrierKeyOf(carrier) !== scopeKey)
    throw new Error("Agent subject and scope carrier were not fused.");

  const assertDispatchable = (): void => {
    scope.assertActive();
    if (!scopeActiveOf(scopeKey)) throw new Error(`Agent scope ${scope.identity.scopeId} is not active.`);
  };
  const payloadFor = (payload: AgentEventPayload = {}): AgentEventPayload => {
    const existing = payload.agent;
    if (existing !== undefined && existing !== subject)
      throw new Error("Agent event subject does not match its scope carrier.");
    return Object.freeze({ ...payload, agent: subject });
  };
  // 契约的 payload 就是「分发方给的内容加上 agent」。K 是泛型时编译器推不出这一点，只在这里断言一次。
  const hookPayloadFor = <K extends AgentHookName>(payload: AgentHookInput<K>): HookPayload<K> =>
    payloadFor(payload as AgentEventPayload) as unknown as HookPayload<K>;

  return Object.freeze({
    subject,
    scopeKey,
    carrier,
    emit: (type: string, payload: AgentEventPayload = {}) => {
      assertDispatchable();
      emitNotification(context, type, payloadFor(payload), carrier);
    },
    serial: async <K extends AgentHookName & SerialHookName>(type: K, payload: AgentHookInput<K>) => {
      assertDispatchable();
      const release = scope.disposer.acquire();
      try {
        return await serialDispatch(context, type, hookPayloadFor<K>(payload), carrier);
      } finally {
        release();
      }
    },
    waterfall: async <K extends AgentHookName & WaterfallHookName>(
      type: K,
      payload: AgentHookInput<K>,
      next: () => HookResult<K> | Promise<HookResult<K>>,
    ) => {
      assertDispatchable();
      const release = scope.disposer.acquire();
      try {
        return await waterfallDispatch(context, type, hookPayloadFor<K>(payload), next, carrier);
      } finally {
        release();
      }
    },
  });
}

export function defaultAgentSubject(scope: AgentScope): AgentSubject {
  return Object.freeze({ agentId: scope.agentId, scopeId: scope.identity.scopeId });
}
