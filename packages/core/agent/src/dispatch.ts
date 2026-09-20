import type { CordisContext } from "@actspace/cordis-adapter";
import { emitContained, requiredDispatch, serialDispatch, waterfallDispatch, type DispatchCarrier } from "@actspace/cordis-adapter";
import { carrierKeyOf, isScopeCarrier, scopeActiveOf, scopeTarget, type AgentScope, type ScopeKey } from "@actspace/core-scope";

/** Live Agent subject carried by Agent-subject events. */
export type AgentSubject = Readonly<Record<string, unknown>> & {
  readonly agentId: string;
  readonly scopeId: string;
};

export type AgentEventPayload = Readonly<Record<string, unknown>>;

export interface AgentEventDispatcher {
  readonly subject: AgentSubject;
  readonly scopeKey: ScopeKey;
  readonly carrier: DispatchCarrier;
  emit(type: string, payload?: AgentEventPayload): Promise<void>;
  required(type: string, payload?: AgentEventPayload): Promise<void>;
  serial(type: string, payload?: AgentEventPayload): Promise<unknown>;
  waterfall<T extends unknown = AgentEventPayload>(type: string, payload?: AgentEventPayload, next?: () => T | Promise<T>): Promise<unknown>;
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
  if (!isScopeCarrier(carrier) || carrierKeyOf(carrier) !== scopeKey) throw new Error("Agent subject and scope carrier were not fused.");

  const assertDispatchable = (): void => {
    scope.assertActive();
    if (!scopeActiveOf(scopeKey)) throw new Error(`Agent scope ${scope.identity.scopeId} is not active.`);
  };
  const payloadFor = (payload: AgentEventPayload = {}): AgentEventPayload => {
    const existing = payload.agent;
    if (existing !== undefined && existing !== subject) throw new Error("Agent event subject does not match its scope carrier.");
    return Object.freeze({ ...payload, agent: subject });
  };

  return Object.freeze({
    subject,
    scopeKey,
    carrier,
    emit: async (type: string, payload: AgentEventPayload = {}) => {
      assertDispatchable();
      const release = scope.disposer.acquire();
      try { await emitContained(context, type, payloadFor(payload), carrier); } finally { release(); }
    },
    required: async (type: string, payload: AgentEventPayload = {}) => {
      assertDispatchable();
      const release = scope.disposer.acquire();
      try { await requiredDispatch(context, type, payloadFor(payload), carrier); } finally { release(); }
    },
    serial: async (type: string, payload: AgentEventPayload = {}) => {
      assertDispatchable();
      const release = scope.disposer.acquire();
      try { return await serialDispatch(context, type, payloadFor(payload), carrier); } finally { release(); }
    },
    waterfall: async <T>(type: string, payload: AgentEventPayload = {}, next: () => T | Promise<T> = () => payloadFor(payload) as unknown as T) => {
      assertDispatchable();
      const release = scope.disposer.acquire();
      try { return await waterfallDispatch(context, type, payloadFor(payload), next, carrier); } finally { release(); }
    },
  });
}

export function defaultAgentSubject(scope: AgentScope): AgentSubject {
  return Object.freeze({ agentId: scope.agentId, scopeId: scope.identity.scopeId });
}
