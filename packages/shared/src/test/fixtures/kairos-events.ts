import type {
  AssistantReply,
  KairosSleepEndPayload,
  KairosSleepInterruptedPayload,
  KairosSleepStartPayload,
  KairosTickInjectedPayload,
  LlmUsagePayload,
  SessionEvent,
  SessionError,
  ThinkingPayload,
  ToolCallPayload,
  ToolExecutionResult
} from "../../session";

/**
 * 共享 fixture：所有 Kairos 单测都从这里 import，避免在各测试文件里重复定义。
 *
 * - `nextEvent` 自增计数器既驱动 id 也驱动 timestamp，保证 fixture 默认升序。
 * - 各工厂只接受 `Partial<Payload> & { sessionId?; agentRunId?; id?; timestamp?; }`，
 *   未覆盖的字段走默认值；要测时间顺序时手动指定 timestamp。
 */

const BASE_TIME = Date.parse("2026-05-27T00:00:00.000Z");
let counter = 0;

export function resetFixtureCounter(): void {
  counter = 0;
}

type EventOverrides = {
  id?: string;
  sessionId?: string;
  agentRunId?: string;
  timestamp?: string;
};

function nextEvent<TPayload>(
  type: SessionEvent<TPayload>["type"],
  payload: TPayload,
  overrides?: EventOverrides
): SessionEvent<TPayload> {
  counter += 1;
  return {
    id: overrides?.id ?? `ev-${counter}`,
    sessionId: overrides?.sessionId ?? "kairos-2026-05-27",
    agentRunId: overrides?.agentRunId ?? "tick-1",
    type,
    timestamp: overrides?.timestamp ?? new Date(BASE_TIME + counter * 1000).toISOString(),
    payload
  };
}

export function makeTickInjected(
  payload: Partial<KairosTickInjectedPayload> = {},
  overrides?: EventOverrides
): SessionEvent<KairosTickInjectedPayload> {
  return nextEvent<KairosTickInjectedPayload>(
    "kairos_tick_injected",
    {
      trigger: payload.trigger ?? "auto",
      content: payload.content ?? "<tick>2026-05-27 00:00:00</tick>",
      ...(payload.briefId ? { briefId: payload.briefId } : {})
    },
    overrides
  );
}

export function makeToolCall(
  payload: Partial<ToolCallPayload> = {},
  overrides?: EventOverrides
): SessionEvent<ToolCallPayload> {
  return nextEvent<ToolCallPayload>(
    "tool_call",
    {
      id: payload.id ?? `tc-${counter + 1}`,
      name: payload.name ?? "read_file",
      arguments: payload.arguments ?? { path: "docs/AGENTS.md" }
    },
    overrides
  );
}

export function makeToolResult(
  payload: Partial<ToolExecutionResult> & { toolCallId: string },
  overrides?: EventOverrides
): SessionEvent<ToolExecutionResult> {
  return nextEvent<ToolExecutionResult>(
    "tool_result",
    {
      toolCallId: payload.toolCallId,
      toolName: payload.toolName ?? "read_file",
      ok: payload.ok ?? true,
      summary: payload.summary ?? "ok",
      ...payload
    },
    overrides
  );
}

export function makeThinking(
  payload: Partial<ThinkingPayload> = {},
  overrides?: EventOverrides
): SessionEvent<ThinkingPayload> {
  return nextEvent<ThinkingPayload>(
    "thinking",
    {
      content: payload.content ?? "Considering what to inspect next…",
      ...(payload.signature ? { signature: payload.signature } : {})
    },
    overrides
  );
}

export function makeAssistantReply(
  payload: Partial<AssistantReply> = {},
  overrides?: EventOverrides
): SessionEvent<AssistantReply> {
  return nextEvent<AssistantReply>(
    "assistant_message",
    {
      content: payload.content ?? "Looked at the doc; nothing new to do.",
      stopReason: payload.stopReason ?? "stop",
      model: payload.model ?? "mock",
      provider: payload.provider ?? "mock"
    },
    overrides
  );
}

export function makeSleepStart(
  payload: Partial<KairosSleepStartPayload> = {},
  overrides?: EventOverrides
): SessionEvent<KairosSleepStartPayload> {
  return nextEvent<KairosSleepStartPayload>(
    "kairos_sleep_start",
    {
      plannedSeconds: payload.plannedSeconds ?? 120,
      reason: payload.reason ?? "after_tick"
    },
    overrides
  );
}

export function makeSleepEnd(
  payload: Partial<KairosSleepEndPayload> = {},
  overrides?: EventOverrides
): SessionEvent<KairosSleepEndPayload> {
  return nextEvent<KairosSleepEndPayload>(
    "kairos_sleep_end",
    { actualSeconds: payload.actualSeconds ?? 120 },
    overrides
  );
}

export function makeSleepInterrupted(
  payload: Partial<KairosSleepInterruptedPayload> = {},
  overrides?: EventOverrides
): SessionEvent<KairosSleepInterruptedPayload> {
  return nextEvent<KairosSleepInterruptedPayload>(
    "kairos_sleep_interrupted",
    {
      reason: payload.reason ?? "user_message",
      remainingSeconds: payload.remainingSeconds ?? 30
    },
    overrides
  );
}

/**
 * 模拟 Kairos runner 在每次 LLM message_end 后落的 llm_usage 事件。
 *
 * 默认贴近一次 DeepSeek-Flash 普通调用：4K input / 1K output / 5K total / ¥0.012；
 * payload.cost.currency 默认 `CNY`，与 model-config.ts 中 DeepSeek pricing 保持一致（国产模型按人民币计费）。
 * 单测里要构造混合币种 / 0 token 等边界，直接覆盖对应字段即可。
 */
export function makeLlmUsage(
  payload: Partial<LlmUsagePayload> = {},
  overrides?: EventOverrides
): SessionEvent<LlmUsagePayload> {
  const promptTokens = payload.promptTokens ?? 4000;
  const completionTokens = payload.completionTokens ?? 1000;
  const totalTokens = payload.totalTokens ?? promptTokens + completionTokens;
  return nextEvent<LlmUsagePayload>(
    "llm_usage",
    {
      callId: payload.callId ?? `call-${counter + 1}`,
      provider: payload.provider ?? "deepseek",
      model: payload.model ?? "deepseek-v4-flash",
      modelId: payload.modelId ?? "deepseek-v4-flash",
      promptTokens,
      completionTokens,
      totalTokens,
      reasoningTokens: payload.reasoningTokens,
      cacheHitTokens: payload.cacheHitTokens,
      cacheMissTokens: payload.cacheMissTokens,
      cost: payload.cost ?? {
        input: 0.01,
        output: 0.002,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0.012,
        currency: "CNY"
      }
    },
    overrides
  );
}

export function makeError(
  payload: Partial<SessionError> = {},
  overrides?: EventOverrides
): SessionEvent<SessionError> {
  return nextEvent<SessionError>(
    "error",
    {
      code: payload.code ?? "kairos.runner.fail",
      message: payload.message ?? "Mock failure for fixture",
      recoverable: payload.recoverable ?? true
    },
    overrides
  );
}

/** 单个 tick：一次 read_file 工具调用 + 一条回复。8 条事件流。 */
export function sampleSingleTickWithToolAndReply(): SessionEvent[] {
  resetFixtureCounter();
  const tick = makeTickInjected();
  const toolCall = makeToolCall({ id: "tc-A", name: "read_file", arguments: { path: "docs/AGENTS.md" } });
  const toolResult = makeToolResult({ toolCallId: "tc-A", toolName: "read_file", ok: true, summary: "12 lines" });
  const reply = makeAssistantReply({ content: "Read AGENTS.md; nothing actionable." });
  const sleepStart = makeSleepStart({ plannedSeconds: 60 });
  const sleepEnd = makeSleepEnd({ actualSeconds: 60 });
  return [tick, toolCall, toolResult, reply, sleepStart, sleepEnd];
}

/** sleep 被用户消息打断。 */
export function sampleSleepInterrupted(): SessionEvent[] {
  resetFixtureCounter();
  const tick = makeTickInjected({ trigger: "auto" });
  const reply = makeAssistantReply({ content: "Idle tick, nothing to do." });
  const sleepStart = makeSleepStart({ plannedSeconds: 120 });
  const interrupt = makeSleepInterrupted({ reason: "user_message", remainingSeconds: 90 });
  return [tick, reply, sleepStart, interrupt];
}

/** 多 tick 混杂：tick1 含 tool + reply；tick2 含 reply + 触发 error。 */
export function sampleMultiTickMix(): SessionEvent[] {
  resetFixtureCounter();
  const tick1 = makeTickInjected({ trigger: "auto" }, { agentRunId: "tick-1" });
  const toolCall1 = makeToolCall(
    { id: "tc-1", name: "grep", arguments: { pattern: "kairos", path: "./" } },
    { agentRunId: "tick-1" }
  );
  const toolResult1 = makeToolResult(
    { toolCallId: "tc-1", toolName: "grep", ok: true, summary: "3 matches" },
    { agentRunId: "tick-1" }
  );
  const reply1 = makeAssistantReply({ content: "Found 3 kairos mentions." }, { agentRunId: "tick-1" });
  const sleepStart1 = makeSleepStart({ plannedSeconds: 30 }, { agentRunId: "tick-1" });
  const sleepEnd1 = makeSleepEnd({ actualSeconds: 30 }, { agentRunId: "tick-1" });

  const tick2 = makeTickInjected({ trigger: "brief", briefId: "summary" }, { agentRunId: "tick-2" });
  const reply2 = makeAssistantReply({ content: "Drafted summary." }, { agentRunId: "tick-2" });
  const error2 = makeError({ message: "compressor timeout" }, { agentRunId: "tick-2" });

  return [
    tick1, toolCall1, toolResult1, reply1, sleepStart1, sleepEnd1,
    tick2, reply2, error2
  ];
}
