export type AgentLoopIntervention =
  | "system-prompt/assemble"
  | "agent/pre-step"
  | "agent/request"
  | "llm/stream"
  | "agent/request-error"
  | "tools/pre-execute"
  | "tools/execute"
  | "tools/post-execute"
  | "agent/turn-stopping";

export type AgentNotification = "agent/tasks-updated" | "agent/session-start" | "agent/status" | "agent/error" | "tools/result" | "session/event" | "llm/chunk";

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

/** Domain packages extend this interface without introducing adapter dependencies. */
export interface DomainEvents {}

/** Declaration surface consumed by Cordis' typed Context methods. */
declare module "@deepseek-ai/cordis" {
  interface Events extends DomainEvents {
    /** @mode waterfall */
    "system-prompt/assemble": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "agent/pre-step": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "agent/request": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "llm/stream": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "agent/request-error": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "tools/pre-execute": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "tools/execute": AgentWaterfallEventHandler;
    /** @mode waterfall */
    "tools/post-execute": AgentWaterfallEventHandler;
    /** @mode serial */
    "agent/turn-stopping": (this: object, payload: AgentSubjectPayload) => unknown;
    /** @mode emit */
    "agent/session-start": (this: object, payload: AgentSubjectPayload) => unknown;
    /** @mode emit */
    "agent/status": (this: object, payload: AgentSubjectPayload) => unknown;
    /** @mode emit */
    "agent/error": (this: object, payload: AgentSubjectPayload) => unknown;
    /** @mode emit */
    "tools/result": (this: object, payload: AgentSubjectPayload) => unknown;
    /** @mode emit */
    "llm/chunk": (this: object, payload: AgentSubjectPayload) => unknown;
    /** @mode emit */
    "session/event": (payload: unknown) => unknown;
    /** @mode emit */
    "session/flush": (payload: unknown) => unknown;
  }
}
