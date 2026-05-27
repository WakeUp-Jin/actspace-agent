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
import type { SessionEvent, SessionEventType } from "@actspace/shared";
import type { KairosShortTermMemoryContext } from "./context/short-term";
import type { KairosConfig } from "./config/loader";
import type { WatchDiffEntry } from "./context/watch-diff";
import type { SessionsDigestResult } from "./context/sessions-digest";
import type { TickPayload } from "./briefs/dispatcher";
import type { QueueMessage } from "./scheduler";
import type { BriefsIndexManager } from "./briefs/index-manager";
import { assembleSystemPrompt } from "./prompt-assembler";

export interface TickResult {
  sleepSecondsRequested: number | null;
  toolCallCount: number;
}

export interface KairosRunnerOptions {
  config: KairosConfig;
  shortTerm: KairosShortTermMemoryContext;
  observeRefresh: () => Promise<{
    watchDiffs: WatchDiffEntry[];
    sessionsDigest: SessionsDigestResult;
  }>;
  activeBriefsCount: () => Promise<number>;
  eventSink: (event: SessionEvent) => Promise<void>;
  llm: LLMService;
  toolManager: ToolManager;
  kairosGuard: KairosGuardContext;
  briefsIndex?: BriefsIndexManager;        // brief tick 闭合后 markRun
  /**
   * 传给 runAgentLoop 的 thinkingEnabled —— 来自 KAIROS_THINKING env。
   * undefined → LLM service 走 ModelSpec.thinkingDefault。
   */
  thinkingEnabled?: boolean;
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

    // 2) assemble system prompt
    const systemPrompt = assembleSystemPrompt({
      config: this.opts.config,
      watchDiffs: observe.watchDiffs,
      sessionsDigest: observe.sessionsDigest,
      shortTermResult: shortTerm,
      now,
      activeBriefsCount,
    });

    // 3) 注入 tick → SessionEvent
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
        content: payload.content,
      },
    });

    // 4) 构造 user message 给 LLM
    const tickUserMsg: UserMessage = {
      role: "user",
      content: payload.content,
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
    const onEvent = async (ev: AgentEvent) => {
      const sessionEvents = agentEventToSessionEvents(ev, {
        sessionId,
        turnId,
        now: this.opts.now ?? (() => new Date()),
        newId: () => makeId("evt", this.opts.newId),
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
      await runAgentLoop(context, this.opts.llm, loopConfig, onEvent);
    } catch (err) {
      runError = err;
    }

    // 6) brief markRun
    if (payload.trigger === "brief" && this.opts.briefsIndex && payload.briefId) {
      await this.opts.briefsIndex.markRun(payload.briefId, runError ? "failed" : "ok", now);
    }

    if (runError) throw runError;

    // 7) 抽取 sleep
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
}

/**
 * AgentEvent → SessionEvent[] 翻译。
 * 只产出 Kairos 需要在 short-term 里"重放回 LLM"的事件：
 *   tool_call / tool_result / assistant_message
 * （thinking/usage 不落，以节省 token；plan 6 渲染 UI 时 ring-buffer 已包含全部 lifecycle）。
 */
function agentEventToSessionEvents(
  ev: AgentEvent,
  ctx: AgentEventConvertCtx,
): SessionEvent[] {
  const out: SessionEvent[] = [];
  const ts = ctx.now().toISOString();
  switch (ev.type) {
    case "tool_start":
      out.push(makeEvent(ctx, ts, "tool_call", {
        id: ev.toolCallId,
        name: ev.toolName,
        arguments: ev.args,
      }));
      break;
    case "tool_end":
      out.push(makeEvent(ctx, ts, "tool_result", {
        toolCallId: ev.toolCallId,
        toolName: ev.toolName,
        ok: !ev.isError,
        summary: ev.result.success
          ? typeof ev.result.data === "string"
            ? truncate(ev.result.data, 240)
            : "ok"
          : ev.result.error ?? "error",
        modelOutput:
          ev.result.success && typeof ev.result.data === "string"
            ? ev.result.data
            : ev.result.error,
      }));
      break;
    case "message_end":
      if (ev.message.role === "assistant") {
        const text = ev.message.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");
        // 仅在有文本时落一条 assistant_message；纯 toolUse 不重复落（tool_call 已经够了）
        if (text.length > 0) {
          out.push(makeEvent(ctx, ts, "assistant_message", {
            content: text,
            stopReason: ev.message.stopReason,
            model: ev.message.model,
            provider: ev.message.provider,
          }));
        }
      }
      break;
    default:
      break;
  }
  return out;
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
