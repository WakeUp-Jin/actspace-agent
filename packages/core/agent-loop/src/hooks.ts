import type { AgentSubject } from "@actspace/agent";
import type { SerialHook, WaterfallHook } from "@actspace/cordis-adapter";
import type {
  LlmFailure,
  LlmMessage,
  LlmStreamEvent,
  LlmToolDefinition,
  ResolvedLlmRequest,
} from "@actspace/llm-service";
import type { RuntimeAgentMode, RuntimeJsonValue } from "@actspace/shared/runtime-v2";

// 五个 payload 里的 `agent` 都由 Loop 的 dispatcher 填：分发的地方给其余字段，监听器收到的是带 `agent` 的完整 payload。

/** `agent/pre-step` 的 payload：一个 Step 记下 `step/start` 之前。 */
export type AgentPreStepPayload = {
  readonly agent: AgentSubject;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  /** 这一轮里的第几步，从 1 开始。 */
  readonly stepIndex: number;
  readonly mode: RuntimeAgentMode;
};
/** `agent/pre-step` 的结果，原样写进 `step/start` 的 `metadata`。内置行为返回 payload 里 `agent` 以外的字段。 */
export type AgentStepMetadata = Readonly<Record<string, RuntimeJsonValue>>;

/** `agent/request` 的 payload：上下文已经组装好，请求还没准备。重试和首次请求都经过这里，`attempt` 从 1 开始。 */
export type AgentRequestPayload = {
  readonly agent: AgentSubject;
  readonly requestId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly routeId: string;
  readonly model: string;
  readonly attempt: number;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly LlmToolDefinition[];
};
/**
 * `agent/request` 的结果，没给的字段沿用 payload 里的值。
 * `messages` 和 `tools` 每次请求都采纳；`routeId` 和 `model` 只有一个 Step 的首次请求采纳，重试沿用首次定下的。
 * 换了路由或模型时 system 消息按新模型重新组装，`messages` 里只留非 system 的部分。步数用到上限的最后一步不给工具，`tools` 不生效。
 */
export type AgentRequestPlan = {
  readonly routeId?: string;
  readonly model?: string;
  readonly messages?: readonly LlmMessage[];
  readonly tools?: readonly LlmToolDefinition[];
};

/**
 * `llm/stream` 的 payload：请求已经准备好，还没发给 Provider。
 * 内置行为把请求发给 Provider；监听器不调用 `next()`、直接返回自己的流时 Provider 不会被调用。
 */
export type LlmStreamPayload = {
  readonly agent: AgentSubject;
  readonly requestId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly request: ResolvedLlmRequest;
  /** 这一轮的取消信号。 */
  readonly signal: AbortSignal;
};

/** `agent/request-error` 的 payload：一次请求失败之后、决定要不要重试之前。 */
export type AgentRequestErrorPayload = {
  readonly agent: AgentSubject;
  readonly requestId: string;
  readonly turnId: string;
  readonly stepId: string;
  /** 失败的是第几次请求，从 1 开始。 */
  readonly attempt: number;
  readonly failure: LlmFailure;
};
/**
 * `agent/request-error` 的结果。`abort`：不再重试。`retry` 带 `delayMs`：等这么久之后重试，不看重试策略。
 * `retry` 不带 `delayMs` 或返回 `undefined`：由重试策略决定。
 * 这次请求已经中止，或者已经流出过内容时不会重试，返回什么都一样。
 */
export type AgentRequestRecovery = { readonly kind: "abort" } | { readonly kind: "retry"; readonly delayMs?: number };

/**
 * `agent/turn-stopping` 的 payload：一轮即将记下 `turn/end`。
 * Loop 不读监听器的返回值：返回 null、false、undefined 以外的值只会让后面的监听器不再被调用，这一轮照常结束。
 */
export type AgentTurnStoppingPayload = {
  readonly agent: AgentSubject;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly reason: "completed" | "step-limit";
  /** 这一轮走了几步。 */
  readonly stepCount: number;
};

/**
 * Loop 的五个干预点。监听器用 `onHook(ctx, 名字, 监听器)` 注册，payload 和返回值的类型从这里来。
 * 监听器抛错时：`llm/stream` 按这次请求失败处理，其余四个让这一轮失败。
 */
export interface AgentLoopHooks {
  /** @mode waterfall */
  "agent/pre-step": WaterfallHook<AgentPreStepPayload, AgentStepMetadata>;
  /** @mode waterfall */
  "agent/request": WaterfallHook<AgentRequestPayload, AgentRequestPlan>;
  /** @mode waterfall */
  "llm/stream": WaterfallHook<LlmStreamPayload, AsyncIterable<LlmStreamEvent>>;
  /** @mode waterfall */
  "agent/request-error": WaterfallHook<AgentRequestErrorPayload, AgentRequestRecovery | undefined>;
  /** @mode serial */
  "agent/turn-stopping": SerialHook<AgentTurnStoppingPayload>;
}

declare module "@actspace/cordis-adapter" {
  interface DomainEvents extends AgentLoopHooks {}
}
