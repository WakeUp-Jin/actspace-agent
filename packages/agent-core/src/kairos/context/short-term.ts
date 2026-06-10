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

  /**
   * 估算磁盘上**全部**短期记忆的 token（压缩触发判定用）。
   *
   * 与 `load()` 的关键差异：
   * - 不受 loadBudgetRatio 截断——load 的预算（默认 75%）永远低于压缩阈值
   *   （默认 85%），如果用 load 的结果判定，阈值永远不会触发；
   * - 用 `loadDailyAll`（含 reset_today 切出的 _NNN 段）——压缩对象是整天，
   *   不是"最新段"。
   */
  async estimateDiskTokens(): Promise<number> {
    let total = 0;
    const countedSummaries = new Set<string>();

    for (const date of await this.store.listAllDates()) {
      const monthDir = this.store.getMonthDir(date);
      const summaries = await this.store.listSummaries(monthDir);
      const covering = this.store.findCoveringSummary(date, summaries);

      if (covering) {
        if (!countedSummaries.has(covering.name)) {
          countedSummaries.add(covering.name);
          const text = await this.store.readSummary(covering.path);
          if (text) total += estimateTokens(text);
        }
        continue;
      }

      const events = await this.store.loadDailyAll(date);
      if (events.length === 0) continue;
      total += estimateMessagesTokens(toLlmMessages(events));
    }

    for (const ys of await this.store.listYearSummaries()) {
      const text = await this.store.readSummary(ys.path);
      if (text) total += estimateTokens(text);
    }

    return total;
  }
}

// ─── SessionEvent → Message 翻译 ──────────────────────────────────────────

/**
 * 翻译规则（重放保真：重放消息的块结构必须与现场发送一致，否则前缀缓存在
 * 分歧处断裂；见 docs/design-docs/agent-kairos-prompt-cache-optimization.md §5.2）：
 *
 * | SessionEvent.type | LLM message |
 * | --- | --- |
 * | user_message            | UserMessage(text)                                  |
 * | kairos_tick_injected    | UserMessage(text)（与 user_message 等价）           |
 * | thinking + assistant_message + tool_call*（连续） | 合并为一条 AssistantMessage，块顺序 [thinking*, text?, toolCall*] |
 * | tool_result             | ToolResultMessage                                  |
 * | 其它（usage 等）         | 跳过                                               |
 *
 * 同回合合并：runner 落盘顺序与现场块顺序一致（thinking → assistant_message →
 * tool_call*，由 message_end 一次性产出），这里把连续的这组事件折叠回一条
 * assistant 消息。tool_use 永远是末尾块（DeepSeek Anthropic 兼容端硬约束）。
 */
export function toLlmMessages(events: SessionEvent[]): Message[] {
  const messages: Message[] = [];
  const group = new AssistantGroup();

  for (const event of events) {
    switch (event.type) {
      case "thinking": {
        // thinking 开启新一次 LLM 回复：已有内容的组先 flush
        if (group.hasTextOrToolCalls() || group.hasThinking()) group.flushInto(messages);
        const payload = event.payload as { content?: string; signature?: string };
        group.addThinking(payload?.content ?? "", payload?.signature, eventMs(event));
        break;
      }
      case "assistant_message":
      case "assistant_reply": {
        // text 块在 thinking 之后、toolCall 之前；已有 text/toolCall 说明是新回复
        if (group.hasTextOrToolCalls()) group.flushInto(messages);
        const payload = event.payload as { content?: string; model?: string; provider?: string };
        group.setText(payload?.content ?? "", payload?.model, payload?.provider, eventMs(event));
        break;
      }
      case "tool_call": {
        const payload = event.payload as ToolCallPayload;
        group.addToolCall(payload, eventMs(event));
        break;
      }
      case "tool_result": {
        group.flushInto(messages);
        const payload = event.payload as ToolExecutionResult;
        const text = payload.modelOutput ?? payload.summary ?? "";
        const msg: ToolResultMessage = {
          role: "toolResult",
          toolCallId: payload.toolCallId ?? "",
          toolName: payload.toolName,
          content: [{ type: "text", text }],
          isError: payload.ok === false,
          timestamp: eventMs(event),
          priority: MessagePriority.NORMAL,
        };
        messages.push(msg);
        break;
      }
      case "user_message":
      case "kairos_tick_injected": {
        group.flushInto(messages);
        const payload = event.payload as { content?: string };
        const msg: UserMessage = {
          role: "user",
          content: payload?.content ?? "",
          timestamp: eventMs(event),
          ...(event.type === "kairos_tick_injected" ? { source: "kairos_tick" as const } : {}),
          priority: MessagePriority.NORMAL,
        };
        messages.push(msg);
        break;
      }
      default:
        // llm_usage / sleep 等：不进 LLM messages，也不打断当前组
        // （llm_usage 紧跟在 message_end 产物之后，打断会把同一回复拆成两条）
        break;
    }
  }
  group.flushInto(messages);
  return messages;
}

/** 累积一次 LLM 回复的块（thinking* → text? → toolCall*），flush 时折叠为一条 assistant 消息。 */
class AssistantGroup {
  private thinkingBlocks: Array<{ type: "thinking"; thinking: string; signature?: string }> = [];
  private text: string | null = null;
  private toolCalls: Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }> = [];
  private model = "kairos";
  private provider = "kairos";
  private timestamp: number | null = null;

  hasThinking(): boolean {
    return this.thinkingBlocks.length > 0;
  }

  hasTextOrToolCalls(): boolean {
    return this.text !== null || this.toolCalls.length > 0;
  }

  addThinking(content: string, signature: string | undefined, ts: number): void {
    this.thinkingBlocks.push({ type: "thinking", thinking: content, ...(signature ? { signature } : {}) });
    this.timestamp ??= ts;
  }

  setText(text: string, model: string | undefined, provider: string | undefined, ts: number): void {
    this.text = text;
    if (model) this.model = model;
    if (provider) this.provider = provider;
    this.timestamp ??= ts;
  }

  addToolCall(payload: ToolCallPayload, ts: number): void {
    this.toolCalls.push({
      type: "toolCall",
      id: payload.id,
      name: payload.name,
      arguments: payload.arguments,
    });
    this.timestamp ??= ts;
  }

  flushInto(messages: Message[]): void {
    if (this.thinkingBlocks.length === 0 && this.text === null && this.toolCalls.length === 0) {
      return;
    }
    const content: AssistantMessage["content"] = [
      ...this.thinkingBlocks,
      ...(this.text !== null ? [{ type: "text" as const, text: this.text }] : []),
      ...this.toolCalls,
    ];
    messages.push({
      role: "assistant",
      content,
      model: this.model,
      provider: this.provider,
      usage: emptyUsage(),
      stopReason: this.toolCalls.length > 0 ? "toolUse" : "stop",
      timestamp: this.timestamp ?? Date.now(),
      priority: MessagePriority.NORMAL,
    });
    this.thinkingBlocks = [];
    this.text = null;
    this.toolCalls = [];
    this.model = "kairos";
    this.provider = "kairos";
    this.timestamp = null;
  }
}

function eventMs(event: SessionEvent): number {
  return Date.parse(event.timestamp) || Date.now();
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
 *
 * 块级清理：合并后一条 assistant 消息可能含多个 toolCall 块，只丢孤儿块、
 * 保留其余内容；消息被清空（既无文本也无 thinking 也无成对 toolCall）才整条丢。
 * 注：块级清理只发生在异常会话（tick 中途崩溃），正常重放不触发，不影响缓存。
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

  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      const hasOrphan = m.content.some((c) => c.type === "toolCall" && !resultIds.has(c.id));
      if (!hasOrphan) {
        out.push(m);
        continue;
      }
      const kept = m.content.filter((c) => c.type !== "toolCall" || resultIds.has(c.id));
      // 只剩 thinking（无 text 无 toolCall）的消息对 API 无意义，丢弃
      const meaningful = kept.some((c) => c.type === "text" || c.type === "toolCall");
      if (meaningful) {
        out.push({
          ...m,
          content: kept,
          stopReason: kept.some((c) => c.type === "toolCall") ? m.stopReason : "stop",
        });
      }
      continue;
    }
    if (m.role === "toolResult") {
      if (callIds.has(m.toolCallId)) out.push(m);
      continue;
    }
    out.push(m);
  }
  return out;
}
