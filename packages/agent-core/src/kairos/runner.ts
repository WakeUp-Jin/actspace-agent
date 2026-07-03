/**
 * KairosRunner — 消费 QueueMessage 并跑一次 Kairos turn。
 *
 * 不持有 sessionId（Kairos 不写 session.jsonl），所有 SessionEvent 通过
 * `eventSink(event)` 异步落到 ShortMemoryStore + RingBuffer + IPC（由 controller 编排）。
 *
 * 关键约束（plan 5 §4）：
 * - 每次 processTick 都重新组装 system prompt（observation/history 都可能变化）。
 * - turn 闭合后，从本 turn 的 tool_call 事件流中抽取**最后一次合法 `sleep(seconds)`**
 *   作为 sleepSecondsRequested；找不到则返回 null，由 scheduler 走 default。
 * - brief tick 完成后回写 briefsIndex.markRun。
 */
import {
  MessagePriority,
  type AssistantMessage,
  type Context,
  type Message,
  type ToolResultMessage,
  type UserMessage,
} from "../messages";
import { toToolDefinition } from "../internal-tools";
import type { LLMService } from "../llm/types";
import type { ToolManager, KairosGuardContext } from "../tools/manager";
import { runAgentLoop } from "../engine/loop";
import type { AgentEvent, AgentLoopConfig } from "../engine/types";
import type { LlmUsagePayload, SessionEvent, SessionEventType } from "@actspace/shared";
import { resolveModelSpecByApiModel } from "@actspace/shared";
import { calculateUsageCost } from "../usage";
import type { KairosShortTermMemoryContext } from "./context/short-term";
import type { KairosConfig } from "./config/loader";
import type { WatchDiffEntry } from "./context/watch-diff";
import type { SessionsDigestResult } from "./context/sessions-digest";
import type { TickPayload } from "./briefs/dispatcher";
import type { QueueMessage } from "./scheduler";
import type { BriefsIndexManager } from "./briefs/index-manager";
import {
  assembleSystemPrompt,
  assembleTickMessage,
  derivePhase,
  type KairosSkillCatalogEntry,
} from "./prompt-assembler";
import type { KairosInboxSummary } from "./inbox";

export interface TickResult {
  sleepSecondsRequested: number | null;
  toolCallCount: number;
}

export interface KairosRunnerOptions {
  config: KairosConfig;
  shortTerm: KairosShortTermMemoryContext;
  /** 白名单过滤后的 Skill catalog；进 system prompt 的「可用 Skills」段。 */
  skillCatalog?: KairosSkillCatalogEntry[];
  observeRefresh: () => Promise<{
    watchDiffs: WatchDiffEntry[];
    sessionsDigest: SessionsDigestResult;
    /**
     * 提交本次观测的游标（watch manifest + sessions lastSeenTurnId）。
     * runner 仅在 tick 正常闭合后调用；失败 tick 不提交 → 下个 tick 重见同批增量。
     */
    commit?: () => Promise<void>;
  }>;
  activeBriefsCount: () => Promise<number>;
  loadInboxSummary?: () => Promise<KairosInboxSummary>;
  /** 提交 inbox 已读水位；与 observe.commit 同一时机（tick 正常闭合后）。 */
  commitInboxCursor?: (summary: KairosInboxSummary) => Promise<void>;
  eventSink: (event: SessionEvent) => Promise<void>;
  llm: LLMService;
  toolManager: ToolManager;
  kairosGuard: KairosGuardContext;
  briefsIndex?: BriefsIndexManager;        // brief tick 闭合后 markRun
  /**
   * 传给 runAgentLoop 的 thinkingEnabled —— 来自 settings.kairos.thinking。
   * undefined → LLM service 走 ModelSpec.thinkingDefault。
   */
  thinkingEnabled?: boolean;
  /**
   * 返回当前 tick 应使用的 AbortSignal —— controller 在 `shutdown()` 时 abort，
   * 让正在飞的 LLM 请求/工具循环立即中断，加速优雅退出。
   * 每次 processTick 都重新取（controller 在 start 时重建 AbortController）。
   */
  getAbortSignal?: () => AbortSignal | undefined;
  /** 测试可注入伪 id / 时间 */
  newId?: () => string;
  now?: () => Date;
  /** Kairos 伪 sessionId，默认 `kairos-<YYYY-MM-DD>` */
  pseudoSessionId?: (now: Date) => string;
}

export class KairosRunner {
  private opts: KairosRunnerOptions;

  constructor(opts: KairosRunnerOptions) {
    this.opts = opts;
  }

  /** 让 controller 在 reloadConfig 后热更新 runner 内的引用，避免重建实例。 */
  applyConfig(config: KairosConfig, guard: KairosGuardContext): void {
    this.opts = { ...this.opts, config, kairosGuard: guard };
  }

  async processTick(msg: QueueMessage): Promise<TickResult> {
    if (msg.type === "system") {
      return { sleepSecondsRequested: null, toolCallCount: 0 };
    }
    const payload = msg.payload;
    const now = (this.opts.now ?? (() => new Date()))();
    const turnId = makeId("turn", this.opts.newId);
    const sessionId = this.opts.pseudoSessionId
      ? this.opts.pseudoSessionId(now)
      : `kairos-${toIsoDate(now)}`;

    // 1) observation + memory
    const observe = await this.opts.observeRefresh();
    const shortTerm = await this.opts.shortTerm.load();
    const activeBriefsCount = await this.opts.activeBriefsCount();
    const inboxSummary = await this.opts.loadInboxSummary?.();

    // 2) 组装上下文：system prompt 只含低频内容（可被前缀缓存复用）；
    //    时间 / phase / 观测增量全部进 tick message（动态尾部）。
    const systemPrompt = assembleSystemPrompt({
      config: this.opts.config,
      shortTermResult: shortTerm,
      skillCatalog: this.opts.skillCatalog,
    });
    const tickContent = assembleTickMessage({
      now,
      phase: derivePhase(now, this.opts.config),
      activeBriefsCount,
      watchDiffs: observe.watchDiffs,
      sessionsDigest: observe.sessionsDigest,
      inboxSummary,
      triggerContent: payload.content,
    });

    // 3) 注入 tick → SessionEvent。
    //    content 与下面发送给 LLM 的 user message 是同一字符串：
    //    发送 = 落盘 = 重放，否则下个 tick 重放时前缀缓存必断。
    await this.opts.eventSink({
      id: makeId("evt", this.opts.newId),
      sessionId,
      turnId,
      type: "kairos_tick_injected",
      timestamp: now.toISOString(),
      schemaVersion: 1,
      payload: {
        trigger: payload.trigger,
        ...(payload.trigger === "brief" ? { briefId: payload.briefId } : {}),
        content: tickContent,
      },
    });

    // 4) 构造 user message 给 LLM
    const tickUserMsg: UserMessage = {
      role: "user",
      content: tickContent,
      timestamp: now.getTime(),
      source: "kairos_tick",
      priority: MessagePriority.NORMAL,
    };

    const historicalMessages: Message[] = shortTerm.messages;

    const tools = this.opts.toolManager.getAll().map(toToolDefinition);
    const context: Context = {
      systemPrompt,
      messages: [...historicalMessages, tickUserMsg],
      tools,
    };

    // 5) 跑 runAgentLoop；把 AgentEvent 转 SessionEvent → eventSink
    const turnEventBuffer: SessionEvent[] = [];
    let usageCallIndex = 0;
    const onEvent = async (ev: AgentEvent) => {
      const sessionEvents = agentEventToSessionEvents(ev, {
        sessionId,
        turnId,
        now: this.opts.now ?? (() => new Date()),
        newId: () => makeId("evt", this.opts.newId),
        nextUsageCallId: () => `llm_call_${turnId}_${++usageCallIndex}`,
      });
      for (const se of sessionEvents) {
        turnEventBuffer.push(se);
        await this.opts.eventSink(se);
      }
    };

    const loopConfig: AgentLoopConfig = {
      toolManager: this.opts.toolManager,
      toolExecution: "sequential",
      toolExecuteOptions: {
        callerAgent: "kairos",
        kairosGuard: this.opts.kairosGuard,
      },
      maxTurns: this.opts.config.blocklist.maxToolCallsPerTick + 2, // 留 2 步给最终 assistant 总结
      thinkingEnabled: this.opts.thinkingEnabled,
    };

    let runError: unknown = null;
    try {
      await runAgentLoop(context, this.opts.llm, loopConfig, onEvent, this.opts.getAbortSignal?.());
    } catch (err) {
      runError = err;
    }

    // 6) brief markRun
    if (payload.trigger === "brief" && this.opts.briefsIndex && payload.briefId) {
      await this.opts.briefsIndex.markRun(payload.briefId, runError ? "failed" : "ok", now);
    }

    if (runError) throw runError;

    // 7) tick 正常闭合：提交观测游标（watch manifest / sessions / inbox 水位）。
    //    失败 tick 已在上面 throw，不会走到这里 → 增量不丢，下个 tick 重见。
    await observe.commit?.();
    if (inboxSummary) {
      await this.opts.commitInboxCursor?.(inboxSummary);
    }

    // 8) 抽取 sleep
    const sleepSeconds = extractLastSleepSeconds(turnEventBuffer);
    const toolCallCount = turnEventBuffer.filter((e) => e.type === "tool_call").length;

    return { sleepSecondsRequested: sleepSeconds, toolCallCount };
  }
}

// ─── helpers ───────────────────────────────────────────────────────────

interface AgentEventConvertCtx {
  sessionId: string;
  turnId: string;
  now: () => Date;
  newId: () => string;
  /**
   * 为本次 turn 内每次 LLM 回复生成一个稳定 callId（counter 自增）。
   * 同一 message_end 对应的 `llm_usage` 事件用同一个 id，便于后续按 call 维度聚合统计。
   */
  nextUsageCallId: () => string;
}

/**
 * AgentEvent → SessionEvent[] 翻译。
 *
 * 产出策略（重放保真：落盘事件序必须能还原现场 assistant 消息的块结构与顺序）：
 * - `message_end`：按现场块顺序落 `thinking*`（含 signature）→ `assistant_message`(text)
 *   → `tool_call*`（来自消息内的 toolCall 块，而不是 tool_start——后者在 sequential
 *   执行下与 tool_result 交错，重放时无法无歧义地还原"同一次 LLM 回复"的归属）。
 * - `tool_end` → `tool_result`。
 * - `llm_usage`：每次 assistant message_end 落一条，承载 token/成本事实。
 *   注：`toLlmMessages` 不翻译 `llm_usage`，所以它不会被回灌进 LLM messages 段，
 *   但前端聚合（用量胶囊、未来日历视图）和跨重启统计都依赖这条事件。
 * - `tool_start` 不再产出事件（避免与 message_end 的 tool_call 重复）。
 */
function agentEventToSessionEvents(
  ev: AgentEvent,
  ctx: AgentEventConvertCtx,
): SessionEvent[] {
  const out: SessionEvent[] = [];
  const ts = ctx.now().toISOString();
  switch (ev.type) {
    case "tool_end": {
      // modelOutput 必须与 engine/loop 现场构造的 ToolResultMessage 文本逐字一致
      // （非字符串 data 同样走 JSON.stringify），否则重放时该处前缀缓存断裂。
      const liveText = ev.result.success
        ? typeof ev.result.data === "string"
          ? ev.result.data
          : JSON.stringify(ev.result.data ?? "")
        : ev.result.error ?? "Unknown error";
      out.push(makeEvent(ctx, ts, "tool_result", {
        toolCallId: ev.toolCallId,
        toolName: ev.toolName,
        ok: !ev.isError,
        summary: truncate(liveText, 240),
        modelOutput: liveText,
      }));
      break;
    }
    case "message_end":
      if (ev.message.role === "assistant") {
        // 1) thinking 块（可多个）；signature 必须保留——anthropic-convert 只在
        //    signature 存在时才把 thinking 块回发给 API，丢 signature = 重放残缺。
        for (const block of ev.message.content) {
          if (block.type === "thinking") {
            out.push(makeEvent(ctx, ts, "thinking", {
              content: block.thinking,
              ...(block.signature ? { signature: block.signature } : {}),
            }));
          }
        }
        // 2) 文本块；仅在有文本时落 assistant_message（纯 toolUse 回复无此事件）
        const text = ev.message.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");
        if (text.length > 0) {
          out.push(makeEvent(ctx, ts, "assistant_message", {
            content: text,
            stopReason: ev.message.stopReason,
            model: ev.message.model,
            provider: ev.message.provider,
          }));
        }
        // 3) toolCall 块（保持现场顺序；tool_use 永远是 assistant 消息的末尾块）
        for (const block of ev.message.content) {
          if (block.type === "toolCall") {
            out.push(makeEvent(ctx, ts, "tool_call", {
              id: block.id,
              name: block.name,
              arguments: block.arguments,
            }));
          }
        }
        // 每次 LLM 回复都落一条 llm_usage（即使是纯工具调用回合，也消耗了 prompt tokens）。
        const usage = buildKairosLlmUsagePayload(ev.message, ctx.nextUsageCallId());
        if (usage) {
          out.push(makeEvent(ctx, ts, "llm_usage", usage));
        }
      }
      break;
    default:
      break;
  }
  return out;
}

/**
 * 把 AssistantMessage.usage 转成可持久化的 `LlmUsagePayload`。
 *
 * 价格按调用时 `model-config.ts` 的快照计算并写盘；后续即使价格调整或模型下架，
 * 历史成本展示也保持稳定。模型未在注册表中匹配时 `cost.total` 为 0，仍写一条事件
 * 保留 token 事实。
 *
 * 若 usage 字段为 0/缺失（mock provider 等情况），返回 null 让调用方跳过。
 */
function buildKairosLlmUsagePayload(
  message: AssistantMessage,
  callId: string,
): LlmUsagePayload | null {
  const usage = message.usage;
  if (!usage) return null;
  const inputTokens = usage.input ?? 0;
  const outputTokens = usage.output ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return null;
  }
  const provider = (message.provider as "deepseek" | "kimi" | "mock" | undefined) ?? "kairos";
  const modelSpec = resolveModelSpecByApiModel(
    message.model,
    provider === "deepseek" || provider === "kimi" ? provider : undefined,
  );
  const cacheHitTokens = usage.cacheHit || usage.cacheRead || undefined;
  const cacheMissTokens = usage.cacheMiss || undefined;
  return {
    callId,
    provider,
    model: message.model,
    modelId: modelSpec?.id,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
    reasoningTokens: usage.reasoning || undefined,
    cacheHitTokens,
    cacheMissTokens,
    serverToolUse: usage.serverToolUse,
    cost: calculateUsageCost(
      {
        inputTokens,
        outputTokens,
        totalTokens,
        reasoningTokens: usage.reasoning,
        cacheHitTokens,
        cacheMissTokens,
      },
      modelSpec?.pricing,
    ),
  };
}

function makeEvent<T>(
  ctx: AgentEventConvertCtx,
  timestamp: string,
  type: SessionEventType,
  payload: T,
): SessionEvent {
  return {
    id: ctx.newId(),
    sessionId: ctx.sessionId,
    turnId: ctx.turnId,
    type,
    timestamp,
    schemaVersion: 1,
    payload,
  };
}

function extractLastSleepSeconds(events: SessionEvent[]): number | null {
  // 我们用 tool_call 而非 tool_result——seconds 是 LLM 给的参数，不是工具返回
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "tool_call") continue;
    const p = e.payload as { name?: string; arguments?: Record<string, unknown> };
    if (p.name !== "sleep") continue;
    const raw = p.arguments?.seconds;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) continue;
    return Math.floor(raw);
  }
  return null;
}

function makeId(prefix: string, factory?: () => string): string {
  if (factory) return factory();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// 让单测能引用未导出函数
export const __internal__ = {
  extractLastSleepSeconds,
  agentEventToSessionEvents,
};

/** 给测试使用：把 ToolResultMessage 当作 AgentEvent 翻译时无副作用。 */
export type _UnusedHelpers = AssistantMessage | ToolResultMessage;
