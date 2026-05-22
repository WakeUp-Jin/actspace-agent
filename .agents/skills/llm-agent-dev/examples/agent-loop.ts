/**
 * Agent 执行循环
 *
 * 参考 pi-agent 的循环设计，核心改进：
 * - 纯函数 runAgentLoop 负责核心循环，不持有任何状态
 * - 双层循环：外层处理 follow-up，内层处理 tool calls + steering
 * - 事件驱动：通过 emit 回调通知外部所有生命周期事件
 * - 流式优先：使用 streamSimple 替代 completeSimple
 * - 无 maxIterations：循环到 agent 自己停止，安全阀通过 shouldStopAfterTurn 实现
 * - 保留现有 Context / ToolScheduler / ContextManager 体系
 */

import {
  BaseLLMService, Context, Message, UserMessage,
  AssistantMessage, ToolResultMessage, ToolCallContent,
  Usage, Tool, TextContent,
  MessagePriority, AssistantMessageEvent,
  getTextContent, getToolCalls, hasToolCalls,
} from './llm-service';
import { ToolScheduler, ToolExecuteResult } from './tool-scheduler';
import { ToolRegistry, InternalTool } from './tool-definition';
import { ContextManager } from './context-manager';

// ─── 工具执行模式 ───

export type ToolExecutionMode = 'sequential' | 'parallel';

// ─── 事件类型 ───

export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: Message[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AssistantMessage; toolResults: ToolResultMessage[] }
  | { type: 'message_start'; message: Message }
  | { type: 'message_delta'; delta: AssistantMessageEvent }
  | { type: 'message_end'; message: Message }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCallId: string; toolName: string; result: ToolExecuteResult; isError: boolean };

export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

// ─── 循环配置 ───

export interface AgentLoopConfig {
  scheduler: ToolScheduler;
  toolExecution?: ToolExecutionMode;
  /** 每轮结束后检查是否应该停止（turnIndex 从 1 开始累加） */
  shouldStopAfterTurn?: (ctx: { message: AssistantMessage; turnIndex: number }) => boolean;
  /** 轮间获取 steering 消息（运行中注入，在下一次 LLM 调用前） */
  getSteeringMessages?: () => Promise<Message[]>;
  /** agent 停止前获取 follow-up 消息（agent 无更多工具调用、本来要停的时候检查） */
  getFollowUpMessages?: () => Promise<Message[]>;
}

// ─── 循环结果 ───

export interface AgentLoopResult {
  message: AssistantMessage;
  totalUsage: Usage;
  messages: Message[];
}

// ─── 核心循环入口 ───

/**
 * 启动 agent loop。
 *
 * context 应在调用前就包含初始消息（如 user message）和 tools。
 * loop 内部直接操作 context.messages（追加 assistant/toolResult 消息），
 * 由于 ContextManager.getContext() 返回持有的引用，ContextManager 会自动同步。
 */
export async function runAgentLoop(
  context: Context,
  llm: BaseLLMService,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal?: AbortSignal,
): Promise<AgentLoopResult> {
  const totalUsage = createEmptyUsage();
  const newMessages: Message[] = [];

  await emit({ type: 'agent_start' });

  await runLoop(context, newMessages, totalUsage, llm, config, emit, signal);

  await emit({ type: 'agent_end', messages: newMessages });

  const lastAssistant = findLastAssistant(newMessages);
  if (!lastAssistant) {
    throw new Error('Agent loop ended without producing an assistant message');
  }

  return { message: lastAssistant, totalUsage, messages: newMessages };
}

// ─── 双层循环核心 ───

/**
 * 双层循环：
 * - 外层：处理 follow-up 消息（agent 本来要停了，但有排队的后续消息）
 * - 内层：处理 tool calls + steering 消息（LLM 返回工具调用或有中途注入的消息）
 *
 * 终止条件（任一满足即停止）：
 * 1. LLM 返回非 toolUse 且无 steering/follow-up 消息
 * 2. LLM 返回 error/aborted
 * 3. shouldStopAfterTurn 返回 true
 * 4. AbortSignal 被触发
 */
async function runLoop(
  context: Context,
  newMessages: Message[],
  totalUsage: Usage,
  llm: BaseLLMService,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal?: AbortSignal,
): Promise<void> {
  let turnIndex = 0;
  let pendingMessages: Message[] = (await config.getSteeringMessages?.()) ?? [];

  while (true) {
    if (signal?.aborted) break;

    let hasMoreToolCalls = true;

    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (signal?.aborted) break;

      await emit({ type: 'turn_start' });

      if (pendingMessages.length > 0) {
        for (const msg of pendingMessages) {
          context.messages.push(msg);
          newMessages.push(msg);
          await emit({ type: 'message_start', message: msg });
          await emit({ type: 'message_end', message: msg });
        }
        pendingMessages = [];
      }

      const assistantMsg = await streamAssistantResponse(context, llm, signal, emit);
      newMessages.push(assistantMsg);
      accumulateUsage(totalUsage, assistantMsg.usage);

      if (assistantMsg.stopReason === 'error' || assistantMsg.stopReason === 'aborted') {
        await emit({ type: 'turn_end', message: assistantMsg, toolResults: [] });
        return;
      }

      const toolResults: ToolResultMessage[] = [];
      hasMoreToolCalls = false;

      if (assistantMsg.stopReason === 'toolUse') {
        const toolCalls = getToolCalls(assistantMsg);
        const results = await executeToolCalls(
          config.scheduler,
          toolCalls,
          config.toolExecution ?? 'sequential',
          emit,
        );

        for (const toolMsg of results) {
          context.messages.push(toolMsg);
          newMessages.push(toolMsg);
          await emit({ type: 'message_start', message: toolMsg });
          await emit({ type: 'message_end', message: toolMsg });
          toolResults.push(toolMsg);
        }
        hasMoreToolCalls = true;
      }

      turnIndex++;
      await emit({ type: 'turn_end', message: assistantMsg, toolResults });

      if (config.shouldStopAfterTurn?.({ message: assistantMsg, turnIndex })) {
        return;
      }

      pendingMessages = (await config.getSteeringMessages?.()) ?? [];
    }

    const followUps = (await config.getFollowUpMessages?.()) ?? [];
    if (followUps.length > 0) {
      pendingMessages = followUps;
      continue;
    }

    break;
  }
}

// ─── 流式 LLM 调用 ───

/**
 * 调用 LLM 并消费流式响应。
 * 通过 message_delta 事件转发流式增量，通过 message_end 提交最终消息。
 * LLM 错误不会抛出，而是返回 stopReason='error' 的 AssistantMessage。
 */
async function streamAssistantResponse(
  context: Context,
  llm: BaseLLMService,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<AssistantMessage> {
  try {
    const stream = llm.streamSimple(context, { signal });

    for await (const event of stream) {
      switch (event.type) {
        case 'text_delta':
        case 'thinking_delta':
        case 'tool_call_delta':
          await emit({ type: 'message_delta', delta: event });
          break;

        case 'done': {
          const msg = event.message;
          if (hasToolCalls(msg)) {
            msg.priority ??= MessagePriority.HIGH;
          }
          context.messages.push(msg);
          await emit({ type: 'message_end', message: msg });
          return msg;
        }

        case 'error':
          throw event.error;
      }
    }

    throw new Error('Stream ended without producing a message');
  } catch (err) {
    const errorMsg: AssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'unknown',
      provider: 'unknown',
      usage: createEmptyUsage(),
      stopReason: signal?.aborted ? 'aborted' : 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
      timestamp: Date.now(),
    };
    context.messages.push(errorMsg);
    await emit({ type: 'message_end', message: errorMsg });
    return errorMsg;
  }
}

// ─── 工具调用执行 ───

/**
 * 执行一批工具调用，支持顺序/并行两种模式。
 * 通过 tool_start/tool_end 事件通知每个工具的执行状态。
 */
async function executeToolCalls(
  scheduler: ToolScheduler,
  toolCalls: ToolCallContent[],
  mode: ToolExecutionMode,
  emit: AgentEventSink,
): Promise<ToolResultMessage[]> {
  const execOne = async (tc: ToolCallContent): Promise<ToolResultMessage> => {
    await emit({
      type: 'tool_start',
      toolCallId: tc.id,
      toolName: tc.name,
      args: tc.arguments,
    });

    const result = await scheduler.execute(tc.id, tc.name, tc.arguments);

    await emit({
      type: 'tool_end',
      toolCallId: tc.id,
      toolName: tc.name,
      result,
      isError: !result.success,
    });

    return {
      role: 'toolResult',
      toolCallId: tc.id,
      toolName: tc.name,
      content: [{ type: 'text', text: result.resultString || result.error || '' }],
      isError: !result.success,
      timestamp: Date.now(),
      source: `tool:${tc.name}`,
      priority: MessagePriority.HIGH,
    };
  };

  if (mode === 'parallel') {
    return Promise.all(toolCalls.map(execOne));
  }

  const results: ToolResultMessage[] = [];
  for (const tc of toolCalls) {
    results.push(await execOne(tc));
  }
  return results;
}

// ─── Agent：极简入口 ───

/**
 * Agent 只做三件事：
 * 1. 组装：持有 llm + contextManager + scheduler + toolRegistry 的引用
 * 2. 入口：提供 run(userText) 方法
 * 3. 取消：持有 AbortController，提供 abort()
 *
 * 不做状态管理（isStreaming 等是 UI 层关注点）。
 * 消息队列通过构造选项的回调传入，需要队列功能时调用者自行管理。
 */
export class Agent {
  private llm: BaseLLMService;
  private contextManager: ContextManager;
  private toolRegistry: ToolRegistry;
  private scheduler: ToolScheduler;
  private abortController?: AbortController;
  private onEvent?: AgentEventSink;
  private toolExecution?: ToolExecutionMode;
  private shouldStopAfterTurn?: AgentLoopConfig['shouldStopAfterTurn'];
  private getSteeringMessages?: AgentLoopConfig['getSteeringMessages'];
  private getFollowUpMessages?: AgentLoopConfig['getFollowUpMessages'];

  constructor(options: {
    llm: BaseLLMService;
    contextManager: ContextManager;
    toolRegistry: ToolRegistry;
    scheduler: ToolScheduler;
    onEvent?: AgentEventSink;
    toolExecution?: ToolExecutionMode;
    shouldStopAfterTurn?: AgentLoopConfig['shouldStopAfterTurn'];
    getSteeringMessages?: AgentLoopConfig['getSteeringMessages'];
    getFollowUpMessages?: AgentLoopConfig['getFollowUpMessages'];
  }) {
    this.llm = options.llm;
    this.contextManager = options.contextManager;
    this.toolRegistry = options.toolRegistry;
    this.scheduler = options.scheduler;
    this.onEvent = options.onEvent;
    this.toolExecution = options.toolExecution;
    this.shouldStopAfterTurn = options.shouldStopAfterTurn;
    this.getSteeringMessages = options.getSteeringMessages;
    this.getFollowUpMessages = options.getFollowUpMessages;
  }

  async run(userText: string): Promise<string> {
    const userMsg: UserMessage = {
      role: 'user',
      content: userText,
      timestamp: Date.now(),
      source: 'user',
      priority: MessagePriority.HIGH,
    };
    this.contextManager.appendMessage(userMsg);

    const context = this.contextManager.getContext();
    context.tools = this.toolRegistry.getAll().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    this.abortController = new AbortController();

    const config: AgentLoopConfig = {
      scheduler: this.scheduler,
      toolExecution: this.toolExecution,
      shouldStopAfterTurn: this.shouldStopAfterTurn,
      getSteeringMessages: this.getSteeringMessages,
      getFollowUpMessages: this.getFollowUpMessages,
    };

    const emit: AgentEventSink = this.onEvent ?? (() => {});

    try {
      const result = await runAgentLoop(
        context, this.llm, config, emit, this.abortController.signal,
      );
      return getTextContent(result.message);
    } finally {
      this.abortController = undefined;
    }
  }

  abort(): void {
    this.abortController?.abort();
  }
}

// ─── 子智能体工具工厂 ───

export interface SubAgentDefinition {
  agentType: string;
  systemPrompt: string;
  allowedTools?: string[];
  maxTurns?: number;
}

/**
 * 创建子智能体工具。
 * 子智能体作为普通 InternalTool 注册，主 agent 通过 tool_call 启动子 agent。
 * 子 agent 有独立的 Context（独立的 systemPrompt + messages + tools），
 * 在隔离的上下文中执行 runAgentLoop，返回结构化结果。
 */
export function createSubAgentTool(options: {
  llm: BaseLLMService;
  scheduler: ToolScheduler;
  toolRegistry: ToolRegistry;
  subAgentDefs?: SubAgentDefinition[];
}): InternalTool {
  const defs = new Map<string, SubAgentDefinition>();
  for (const def of options.subAgentDefs ?? []) {
    defs.set(def.agentType, def);
  }

  return {
    name: 'Agent',
    description: 'Launch a sub-agent to handle a complex task autonomously',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Task description for the sub-agent' },
        description: { type: 'string', description: 'Short summary of the task' },
        subagent_type: { type: 'string', description: 'Type of sub-agent to launch' },
      },
      required: ['prompt', 'description'],
    },
    isReadOnly: true,
    handler: async (args) => {
      const { prompt, subagent_type } = args as {
        prompt: string;
        description: string;
        subagent_type?: string;
      };

      const agentType = (subagent_type as string) ?? 'general-purpose';
      const def = defs.get(agentType);
      const maxTurns = def?.maxTurns ?? 10;

      const subContext: Context = {
        systemPrompt: def?.systemPrompt ?? 'You are a helpful assistant.',
        messages: [{
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
          source: 'parent-agent',
          priority: MessagePriority.HIGH,
        }],
        tools: buildSubAgentToolDefs(options.toolRegistry, def?.allowedTools),
      };

      const startTime = Date.now();
      const agentId = `a${Math.random().toString(36).slice(2, 10)}`;
      let toolUseCount = 0;

      const config: AgentLoopConfig = {
        scheduler: options.scheduler,
        shouldStopAfterTurn: ({ turnIndex }) => turnIndex >= maxTurns,
      };

      const result = await runAgentLoop(
        subContext,
        options.llm,
        config,
        (event) => {
          if (event.type === 'tool_end') toolUseCount++;
        },
      );

      return {
        success: true,
        data: {
          agentId,
          agentType,
          text: getTextContent(result.message),
          totalToolUseCount: toolUseCount,
          totalDurationMs: Date.now() - startTime,
          totalTokens: result.totalUsage.totalTokens,
        },
      };
    },
  };
}

function buildSubAgentToolDefs(registry: ToolRegistry, allowedTools?: string[]): Tool[] {
  const tools = allowedTools
    ? registry.getAll().filter(t => allowedTools.includes(t.name))
    : registry.getAll();
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

// ─── Usage 工具函数 ───

function createEmptyUsage(): Usage {
  return {
    input: 0, output: 0,
    cacheRead: 0, cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function accumulateUsage(total: Usage, delta: Usage): void {
  total.input += delta.input;
  total.output += delta.output;
  total.cacheRead += delta.cacheRead;
  total.cacheWrite += delta.cacheWrite;
  total.totalTokens += delta.totalTokens;
  total.cost.input += delta.cost.input;
  total.cost.output += delta.cost.output;
  total.cost.cacheRead += delta.cost.cacheRead;
  total.cost.cacheWrite += delta.cost.cacheWrite;
  total.cost.total += delta.cost.total;
}

function findLastAssistant(messages: Message[]): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') return msg;
  }
  return undefined;
}
