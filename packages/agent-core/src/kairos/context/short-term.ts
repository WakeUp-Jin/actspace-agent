import type { SessionEvent, ToolCallPayload, ToolExecutionResult } from "@actspace/shared";
import {
  MessagePriority,
  type AssistantMessage,
  type Message,
  type ToolResultMessage,
  type UserMessage,
} from "../../messages";
import { estimateMessagesTokens, estimateTokens } from "../../context/token-estimator";
import type { ShortMemoryStore } from "../storage/short-memory-store";

export interface KairosShortTermLoadResult {
  /** 已 sanitize（去掉 orphan tool_call/tool_result）的消息序列，时间升序。 */
  messages: Message[];
  /**
   * 历史摘要原文片段，由 prompt-assembler 在 [6] 段拼接展示。
   * `path` 为该段所属的 `*.summary.md` 绝对路径，便于上下文 Sheet 标注源文件。
   */
  summarySegments: Array<{ label: string; text: string; path: string }>;
  /** 加载到的总 token 估算（用于观察是否触发压缩阈值）。 */
  loadedTokenEstimate: number;
}

export interface KairosShortTermMemoryContextOptions {
  store: ShortMemoryStore;
  contextWindow: number;
  loadBudgetRatio?: number;        // 默认 0.75
}

/**
 * Kairos 短期记忆上下文：把磁盘上的 SessionEvent 流加载为可送进 LLM 的 messages。
 *
 * 算法与 heartclaw `short_term_memory.py` 对齐：
 * 1. 从新到旧扫所有日期，命中 week/month summary 则跳过原始 jsonl 走摘要
 * 2. 累计 token 达 budget 即停
 * 3. 加载所有 year_*.summary.md（独立于 date budget）
 * 4. 反转为时间升序，sanitize 不完整工具配对
 */
export class KairosShortTermMemoryContext {
  private readonly store: ShortMemoryStore;
  private readonly contextWindow: number;
  private readonly loadBudgetRatio: number;

  constructor(opts: KairosShortTermMemoryContextOptions) {
    this.store = opts.store;
    this.contextWindow = opts.contextWindow;
    this.loadBudgetRatio = opts.loadBudgetRatio ?? 0.75;
  }

  async load(): Promise<KairosShortTermLoadResult> {
    const budget = Math.floor(this.contextWindow * this.loadBudgetRatio);
    let used = 0;

    const dates = await this.store.listAllDates();
    const dayBatches: Array<{ date: string; events: SessionEvent[] }> = [];
    const summaries: Array<{ label: string; text: string; path: string }> = [];
    const loadedSummaryNames = new Set<string>();

    for (const date of dates) {
      if (used >= budget) break;

      const monthDir = this.store.getMonthDir(date);
      const monthSummaries = await this.store.listSummaries(monthDir);
      const covering = this.store.findCoveringSummary(date, monthSummaries);

      if (covering) {
        if (!loadedSummaryNames.has(covering.name)) {
          const text = await this.store.readSummary(covering.path);
          if (text) {
            const tokens = estimateTokens(text);
            if (used + tokens <= budget) {
              summaries.push({ label: covering.label, text, path: covering.path });
              loadedSummaryNames.add(covering.name);
              used += tokens;
            }
          }
        }
        continue;
      }

      const events = await this.store.loadDaily(date);
      if (events.length === 0) continue;
      const messages = toLlmMessages(events);
      const tokens = estimateMessagesTokens(messages);
      if (used + tokens <= budget) {
        dayBatches.push({ date, events });
        used += tokens;
      } else {
        break;
      }
    }

    const yearSummaries = await this.store.listYearSummaries();
    for (const ys of yearSummaries) {
      if (used >= budget) break;
      const text = await this.store.readSummary(ys.path);
      if (!text) continue;
      const tokens = estimateTokens(text);
      if (used + tokens <= budget) {
        summaries.push({ label: ys.label, text, path: ys.path });
        used += tokens;
      }
    }

    // 时序：由新到旧加载，需反转为升序
    dayBatches.reverse();
    summaries.reverse();

    const allEvents = dayBatches.flatMap((b) => b.events);
    const rawMessages = toLlmMessages(allEvents);
    const messages = sanitizeOrphanToolPairs(rawMessages);

    return {
      messages,
      summarySegments: summaries,
      loadedTokenEstimate: used,
    };
  }

  /** 仅估算当前磁盘上的"短期记忆"总 token，便于 controller 决定是否触发压缩。 */
  async estimateTokens(): Promise<number> {
    const result = await this.load();
    return result.loadedTokenEstimate;
  }
}

// ─── SessionEvent → Message 翻译 ──────────────────────────────────────────

/**
 * 翻译规则（详见 docs/exec-plans/active/kairos_short_term_memory.md §3）：
 *
 * | SessionEvent.type | LLM message |
 * | --- | --- |
 * | user_message            | UserMessage(text)                       |
 * | kairos_tick_injected    | UserMessage(text)（与 user_message 等价）|
 * | assistant_message/reply | AssistantMessage(text)                  |
 * | tool_call               | AssistantMessage(toolCall content)      |
 * | tool_result             | ToolResultMessage                       |
 * | 其它（thinking/usage 等）| 跳过                                    |
 *
 * 简化：每个事件单独翻译成一条 Message；plan 5 controller/runner 阶段会做"同 turn 合并"优化。
 */
export function toLlmMessages(events: SessionEvent[]): Message[] {
  const messages: Message[] = [];
  for (const event of events) {
    const msg = translateEvent(event);
    if (msg) messages.push(msg);
  }
  return messages;
}

function translateEvent(event: SessionEvent): Message | null {
  const timestamp = Date.parse(event.timestamp) || Date.now();
  switch (event.type) {
    case "user_message": {
      const payload = event.payload as { content?: string };
      const content = payload?.content ?? "";
      const msg: UserMessage = { role: "user", content, timestamp, priority: MessagePriority.NORMAL };
      return msg;
    }
    case "kairos_tick_injected": {
      const payload = event.payload as { content?: string };
      const content = payload?.content ?? "";
      const msg: UserMessage = {
        role: "user",
        content,
        timestamp,
        source: "kairos_tick",
        priority: MessagePriority.NORMAL,
      };
      return msg;
    }
    case "assistant_message":
    case "assistant_reply": {
      const payload = event.payload as { content?: string; model?: string; provider?: string };
      const msg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: payload?.content ?? "" }],
        model: payload?.model ?? "kairos",
        provider: payload?.provider ?? "kairos",
        usage: emptyUsage(),
        stopReason: "stop",
        timestamp,
        priority: MessagePriority.NORMAL,
      };
      return msg;
    }
    case "tool_call": {
      const payload = event.payload as ToolCallPayload;
      const msg: AssistantMessage = {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: payload.id,
            name: payload.name,
            arguments: payload.arguments,
          },
        ],
        model: "kairos",
        provider: "kairos",
        usage: emptyUsage(),
        stopReason: "toolUse",
        timestamp,
        priority: MessagePriority.NORMAL,
      };
      return msg;
    }
    case "tool_result": {
      const payload = event.payload as ToolExecutionResult;
      const text = payload.modelOutput ?? payload.summary ?? "";
      const msg: ToolResultMessage = {
        role: "toolResult",
        toolCallId: payload.toolCallId ?? "",
        toolName: payload.toolName,
        content: [{ type: "text", text }],
        isError: payload.ok === false,
        timestamp,
        priority: MessagePriority.NORMAL,
      };
      return msg;
    }
    default:
      return null;
  }
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    cacheHit: 0,
    cacheMiss: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

// ─── Sanitize orphan tool pairs ───────────────────────────────────────────

/**
 * 扔掉孤儿 tool_call（无 toolResult）和孤儿 toolResult（无 tool_call）。
 * LLM API（Kimi/DeepSeek/Anthropic）几乎都要求"配对成立"，否则报 400。
 */
export function sanitizeOrphanToolPairs(messages: Message[]): Message[] {
  const callIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") {
      for (const c of m.content) {
        if (c.type === "toolCall") callIds.add(c.id);
      }
    }
  }
  const resultIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "toolResult") resultIds.add(m.toolCallId);
  }

  return messages.filter((m) => {
    if (m.role === "assistant") {
      const toolCalls = m.content.filter((c) => c.type === "toolCall");
      if (toolCalls.length === 0) return true;
      // 至少有一个 tool_call 对应 result 才保留；否则丢
      return toolCalls.some((c) => c.type === "toolCall" && resultIds.has(c.id));
    }
    if (m.role === "toolResult") {
      return callIds.has(m.toolCallId);
    }
    return true;
  });
}
