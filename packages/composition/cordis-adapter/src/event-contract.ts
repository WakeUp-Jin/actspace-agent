export type AgentLoopIntervention =
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

/** Domain packages extend this interface without introducing adapter dependencies. */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging extension point
export interface DomainEvents {}

// 干预点的契约由拥有它的包声明并合并进 `DomainEvents`：Loop 的五个在 `@actspace/agent-loop` 的 hooks.ts，
// 工具的三个在 `@actspace/tool-runtime` 的 hooks.ts。这里只有两种监听器形状，和按名字取 payload、结果类型的办法。

/** waterfall 干预点的监听器。`next()` 交给下游，最里面是内置行为；不调用就短路。返回值是这个干预点的结果。 */
export type WaterfallHook<TPayload, TResult> = (this: object, payload: TPayload, next: () => TResult | Promise<TResult>) => TResult | Promise<TResult>;
/** serial 干预点的监听器，按注册顺序逐个等待。返回 null、false、undefined 以外的值，后面的监听器不再被调用。 */
export type SerialHook<TPayload> = (this: object, payload: TPayload) => unknown;

/** 当前程序里声明了契约的干预点。拥有它的包没被引入时名字不在这里，分发和注册都编译不过。 */
export type HookName = Extract<keyof DomainEvents, AgentLoopIntervention>;
/** 没有 `next` 参数的是 serial。必须先判 serial：参数少的函数可以赋给参数多的，反过来判会把 serial 也算成 waterfall。 */
export type SerialHookName = { [K in HookName]: DomainEvents[K] extends SerialHook<never> ? K : never }[HookName];
export type WaterfallHookName = Exclude<HookName, SerialHookName>;
/** 监听器收到的 payload。 */
export type HookPayload<K extends HookName> = DomainEvents[K] extends (this: object, payload: infer TPayload, ...rest: never[]) => unknown ? TPayload : never;
/** waterfall 干预点的结果：监听器的返回值，也是内置行为的返回值。 */
export type HookResult<K extends WaterfallHookName> = DomainEvents[K] extends WaterfallHook<never, infer TResult> ? TResult : never;

/** Declaration surface consumed by Cordis' typed Context methods. */
declare module "@deepseek-ai/cordis" {
  interface Events extends DomainEvents {
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
