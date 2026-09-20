export type AgentLoopIntervention =
  | "system-prompt/assemble"
  | "agent/pre-step"
  | "agent/request"
  | "llm/stream"
  | "agent/request-error"
  | "tools/pre-execute"
  | "tools/execute"
  | "tools/post-execute"
  | "agent/turn-stopping"
  | "session/checkpoint";

export type AgentNotification = "agent/session-start" | "agent/status" | "agent/error" | "tools/result" | "session/event" | "llm/chunk";

export type RuntimeLifecycleEvent =
  | "runtime/booting"
  | "plugin/codec-discovered"
  | "entry/inserting"
  | "entry/inserted"
  | "entry/activation-failed"
  | "entry/disposed"
  | "runtime/ready"
  | "runtime/quiescing"
  | "runtime/disposed"
  | "session/created"
  | "session/disposed"
  | "session/flush"
  | "agent/created"
  | "agent/disposed"
  | "agent/inbox/inserted"
  | "agent/inbox/claimed"
  | "agent/inbox/discarded";

export type CordisEventType = AgentLoopIntervention | AgentNotification | RuntimeLifecycleEvent | (string & {});
export type AgentEventMeta = { readonly agentRunId?: string; readonly turnId?: string; readonly stepId?: string; readonly signal?: AbortSignal };
export type AgentSubject = { readonly id?: string; readonly agentId?: string };
export type CordisEventPayload = Record<string, unknown> & AgentEventMeta;
export type AgentSubjectPayload = CordisEventPayload & { readonly agent: AgentSubject };
export type AgentWaterfallEventHandler<T = AgentSubjectPayload, R = T> = (this: object, payload: T, next: () => R | Promise<R>) => R | Promise<R>;

/** Declaration surface consumed by Cordis' typed Context methods. */
declare module "@deepseek-ai/cordis" {
  interface Events {
    "system-prompt/assemble": AgentWaterfallEventHandler;
    "agent/pre-step": AgentWaterfallEventHandler;
    "agent/request": AgentWaterfallEventHandler;
    "llm/stream": AgentWaterfallEventHandler;
    "agent/request-error": AgentWaterfallEventHandler;
    "tools/pre-execute": AgentWaterfallEventHandler;
    "tools/execute": AgentWaterfallEventHandler;
    "tools/post-execute": AgentWaterfallEventHandler;
    "agent/turn-stopping": (this: object, payload: AgentSubjectPayload) => unknown;
    "agent/session-start": (this: object, payload: AgentSubjectPayload) => unknown;
    "agent/status": (this: object, payload: AgentSubjectPayload) => unknown;
    "agent/error": (this: object, payload: AgentSubjectPayload) => unknown;
    "tools/result": (this: object, payload: AgentSubjectPayload) => unknown;
    "llm/chunk": (this: object, payload: AgentSubjectPayload) => unknown;
    "session/checkpoint": (this: object, payload: AgentSubjectPayload) => unknown;
    "session/event": (payload: unknown) => unknown;
    "session/flush": (payload: unknown) => unknown;
  }
}
