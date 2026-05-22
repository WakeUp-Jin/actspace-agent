/**
 * KAIROS 运行器示例
 * 实现 KAIROS 自治模式的核心组件：
 * - MessageQueue：优先级消息队列，统一所有消息源
 * - KairosRunner：KAIROS 专用执行器，独立上下文和系统提示词
 * - QueueProcessor：串行消费队列，尾递归调度 tick
 * - SleepTool：让模型自主决定休眠时机和时长
 */

import {
  BaseLLMService, Context, Message,
  UserMessage, AssistantMessage,
  getTextContent,
} from './llm-service';
import { ToolScheduler } from './tool-scheduler';
import { ToolRegistry } from './tool-definition';

// ─── 消息类型 ───

type MessageMode = 'user' | 'cron' | 'tick';

enum QueuePriority {
  INTERRUPT = 0,
  USER = 1,
  CRON = 2,
  TICK = 3,
}

interface QueueMessage {
  id: string;
  priority: number;
  mode: MessageMode;
  content: string;
  chatId?: string;
  createdAt: number;
  resolve?: (result: string) => void;
  reject?: (error: Error) => void;
}

// ─── 优先级消息队列 ───

class MessageQueue {
  private heap: QueueMessage[] = [];
  private waitResolve: (() => void) | null = null;
  private wakeResolve: (() => void) | null = null;

  async enqueue(msg: QueueMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      msg.resolve = resolve;
      msg.reject = reject;
      this.heap.push(msg);
      this.heap.sort((a, b) =>
        a.priority !== b.priority
          ? a.priority - b.priority
          : a.createdAt - b.createdAt
      );

      if (this.waitResolve) {
        this.waitResolve();
        this.waitResolve = null;
      }
      if (this.wakeResolve) {
        this.wakeResolve();
        this.wakeResolve = null;
      }
    });
  }

  async dequeue(): Promise<QueueMessage> {
    if (this.heap.length > 0) {
      return this.heap.shift()!;
    }
    await new Promise<void>(resolve => { this.waitResolve = resolve; });
    return this.heap.shift()!;
  }

  hasPending(): boolean {
    return this.heap.length > 0;
  }

  /**
   * 返回一个 Promise，新消息入队时 resolve。
   * 用于实现可中断 sleep。
   */
  waitForWake(): Promise<void> {
    return new Promise<void>(resolve => { this.wakeResolve = resolve; });
  }
}

// ─── Sleep 工具 ───

const SLEEP_TOOL_DEFINITION = {
  name: 'Sleep',
  description: 'Sleep for a specified duration. Use to control pacing between actions.',
  parameters: {
    type: 'object' as const,
    properties: {
      seconds: {
        type: 'number',
        description: 'Number of seconds to sleep',
      },
    },
    required: ['seconds'],
  },
};

// ─── KAIROS 系统提示词 ───

const KAIROS_SYSTEM_PROMPT = `# Autonomous work

你正在自主运行。你会收到 <tick> 提示，它们让你在轮次之间保持活跃——只需把它们当作"你醒了，现在干嘛？"来对待。每个 <tick> 中的时间是用户当前的本地时间。

多个 tick 可能会被批量合并成一条消息。这很正常，只需处理最新的一个。绝不要回显或重复 tick 内容。

## Pacing
用 Sleep 工具来控制两次行动之间的等待时长。如果某个 tick 上没有有用的事可做，你必须调用 Sleep。绝不要只回复"没事做"——那浪费轮次。

## First wake-up
在新会话的第一次 tick 上，简短地向用户问好，问问他们想做什么。不要未经提示就开始做事。

## Subsequent wake-ups
找有用的事做。不要骚扰用户——如果已经问过问题而对方还没回复，不要再问。直接做，不要絮叨计划。如果确实无事可做，立即调用 Sleep。

## Staying responsive
用户活跃时频繁检查消息，优先回复用户而不是继续后台工作。

## Bias toward action
凭最佳判断直接行动，不请求确认。犹豫时选一个方案就走。

## Be concise
文字输出简短，聚焦于需要用户输入的决定、里程碑状态更新、阻塞性错误。`;

// ─── KairosRunner ───

interface KairosConfig {
  defaultSleepSeconds: number;
  minSleepSeconds: number;
  maxSleepSeconds: number;
}

const DEFAULT_KAIROS_CONFIG: KairosConfig = {
  defaultSleepSeconds: 60,
  minSleepSeconds: 10,
  maxSleepSeconds: 300,
};

const MAX_HISTORY_MESSAGES = 10;

class KairosRunner {
  private llm: BaseLLMService;
  private toolRegistry: ToolRegistry;
  private scheduler: ToolScheduler;
  private config: KairosConfig;
  private recentHistory: Message[] = [];

  constructor(options: {
    llm: BaseLLMService;
    toolRegistry: ToolRegistry;
    scheduler: ToolScheduler;
    config?: Partial<KairosConfig>;
  }) {
    this.llm = options.llm;
    this.toolRegistry = options.toolRegistry;
    this.scheduler = options.scheduler;
    this.config = { ...DEFAULT_KAIROS_CONFIG, ...options.config };

    this.registerSleepTool();
  }

  /**
   * 处理一次 tick，返回 LLM 回复文本。
   * KairosRunner 有独立的上下文：KAIROS 系统提示词 + 最近 N 轮 tick 历史。
   */
  async handleTick(msg: QueueMessage): Promise<string> {
    const context = this.buildContext(msg.content);

    const assistantMsg = await this.llm.completeSimple(context);
    const replyText = getTextContent(assistantMsg);

    this.updateHistory(msg.content, replyText);

    return replyText;
  }

  /**
   * 从最近的工具调用记录中提取 Sleep 秒数。
   * 如果 LLM 没有调用 Sleep，返回默认值。
   */
  getSleepSeconds(resultText: string): number {
    return this.config.defaultSleepSeconds;
  }

  private buildContext(tickContent: string): Context {
    const userMsg: UserMessage = {
      role: 'user',
      content: tickContent,
      timestamp: Date.now(),
    };

    return {
      systemPrompt: KAIROS_SYSTEM_PROMPT,
      messages: [
        ...this.recentHistory.slice(-MAX_HISTORY_MESSAGES),
        userMsg,
      ],
      tools: this.toolRegistry.getAll().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, unknown>,
      })),
    };
  }

  private updateHistory(tickContent: string, reply: string) {
    const userMsg: UserMessage = {
      role: 'user',
      content: tickContent,
      timestamp: Date.now(),
    };
    this.recentHistory.push(userMsg);

    if (reply.trim()) {
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: reply }],
        model: this.llm['config'].model,
        provider: this.llm['config'].provider,
        usage: {
          input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
      };
      this.recentHistory.push(assistantMsg);
    }

    if (this.recentHistory.length > MAX_HISTORY_MESSAGES) {
      this.recentHistory = this.recentHistory.slice(-MAX_HISTORY_MESSAGES);
    }
  }

  private registerSleepTool() {
    this.scheduler.registerTool({
      name: SLEEP_TOOL_DEFINITION.name,
      description: SLEEP_TOOL_DEFINITION.description,
      parameters: SLEEP_TOOL_DEFINITION.parameters,
      isReadOnly: true,
      handler: async (args) => {
        const { seconds } = args as { seconds: number };
        const clamped = Math.max(
          this.config.minSleepSeconds,
          Math.min(seconds, this.config.maxSleepSeconds),
        );
        return { success: true, data: `Sleeping for ${clamped} seconds` };
      },
    });
  }
}

// ─── Agent 运行器协议 ───

interface AgentRunner {
  run(userText: string, chatId?: string): Promise<string>;
}

// ─── QueueProcessor：串行消费 + 尾递归调度 ───

const MAX_CONSECUTIVE_TICK_ERRORS = 5;
const TICK_ERROR_COOLDOWN_MS = 60_000;
const STARTUP_DELAY_MS = 5_000;

class QueueProcessor {
  private queue: MessageQueue;
  private agent: AgentRunner;
  private kairos: KairosRunner | null;
  private kairosConfig: KairosConfig | null;
  private running = false;
  private consecutiveTickErrors = 0;

  constructor(options: {
    queue: MessageQueue;
    agent: AgentRunner;
    kairos?: KairosRunner;
    kairosConfig?: KairosConfig;
  }) {
    this.queue = options.queue;
    this.agent = options.agent;
    this.kairos = options.kairos ?? null;
    this.kairosConfig = options.kairosConfig ?? null;
  }

  private get kairosEnabled(): boolean {
    return this.kairos !== null && this.kairosConfig !== null;
  }

  /**
   * 主循环：dequeue → dispatch → tail_dispatch → 回到 dequeue
   */
  async run(): Promise<void> {
    this.running = true;

    if (this.kairosEnabled) {
      await sleep(STARTUP_DELAY_MS);
      if (!this.queue.hasPending()) {
        await this.injectTick();
      }
    }

    while (this.running) {
      const msg = await this.queue.dequeue();
      let resultText = '';
      let tickFailed = false;

      try {
        resultText = await this.dispatch(msg);
        msg.resolve?.(resultText);

        if (msg.mode === 'tick') {
          this.consecutiveTickErrors = 0;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        msg.reject?.(error);

        if (msg.mode === 'tick') {
          tickFailed = true;
          this.consecutiveTickErrors++;
          if (this.consecutiveTickErrors >= MAX_CONSECUTIVE_TICK_ERRORS) {
            await sleep(TICK_ERROR_COOLDOWN_MS);
            this.consecutiveTickErrors = 0;
          }
        }
      }

      await this.tailDispatch(msg, resultText, tickFailed);
    }
  }

  stop() {
    this.running = false;
  }

  // ─── 消息分发 ───

  private async dispatch(msg: QueueMessage): Promise<string> {
    if (msg.mode === 'tick') {
      if (!this.kairos) return '';
      return this.kairos.handleTick(msg);
    }
    return this.agent.run(msg.content, msg.chatId);
  }

  // ─── 尾递归调度 ───

  private async tailDispatch(
    msg: QueueMessage,
    resultText: string,
    tickFailed: boolean,
  ): Promise<void> {
    if (!this.kairosEnabled) return;

    if (msg.mode === 'user' || msg.mode === 'cron') {
      if (!this.queue.hasPending()) {
        await this.injectTick();
      }
      return;
    }

    if (msg.mode === 'tick') {
      const sleepSeconds = tickFailed
        ? this.kairosConfig!.defaultSleepSeconds
        : this.kairos!.getSleepSeconds(resultText);

      const interrupted = await this.interruptibleSleep(sleepSeconds);
      if (interrupted) return;

      if (!this.queue.hasPending()) {
        await this.injectTick();
      }
    }
  }

  private async injectTick(): Promise<void> {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const msg: QueueMessage = {
      id: Math.random().toString(36).slice(2, 10),
      priority: QueuePriority.TICK,
      mode: 'tick',
      content: `<tick>${now}</tick>`,
      createdAt: Date.now(),
    };
    this.queue.enqueue(msg).catch(() => {});
  }

  /**
   * 可中断的 sleep。
   * 返回 true 表示被中断（有新消息入队），false 表示正常超时。
   */
  private async interruptibleSleep(seconds: number): Promise<boolean> {
    const clamped = Math.max(
      this.kairosConfig!.minSleepSeconds,
      Math.min(seconds, this.kairosConfig!.maxSleepSeconds),
    );

    const timeoutPromise = sleep(clamped * 1000).then(() => false);
    const wakePromise = this.queue.waitForWake().then(() => true);

    return Promise.race([timeoutPromise, wakePromise]);
  }
}

// ─── 工具函数 ───

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
