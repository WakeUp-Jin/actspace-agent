/**
 * ConversationContext — 会话历史模块
 *
 * 直接管理 messages 数组。运行期 format() / appendMessage 都是纯内存操作。
 *
 * 会话历史的所有权属于本模块——这意味着"从 session.jsonl 恢复"也是本模块的能力，
 * 通过 `createFromSession(sessionPath)` 工厂在构造阶段一次性完成
 * `parseJsonl → sessionEventsToMessages → 填 messages`，与 SystemPromptContext
 * 在构造时吃 corePrompt 的机制对齐。`ContextManager.getContext()` 保持同步。
 *
 * 加载只发生在构造阶段；运行期没有"未加载"状态，也没有重复读盘。
 *
 * 历史压缩同理：会话历史归本模块所有，「怎么压自己」也由本模块执行——
 * `compress()` 编排 planCompaction → summarizer → applyCompaction 全流程，
 * `ContextManager` 只负责发指令（阈值/防抖判断），不触碰压缩细节。
 * compression/ 目录是被本模块消费的纯函数工具库（序列化、prompt、summarizer）。
 * 将来其他模块（如长期记忆）需要压缩时，同样在该模块自身上提供 compress()。
 */

import type { Message, UserMessage } from "../../messages";
import { MessagePriority } from "../../messages";
import { parseJsonl } from "../../persistence/jsonl";
import { sessionEventsToMessages } from "../../adapters";
import type { ContextModule, ContextParts } from "../types";
import type { Summarizer } from "../compression/summarizer";
import { serializeMessagesForSummary } from "../compression/history-serializer";
import {
  buildCompactionMessageBody,
  historyRecoveryFooter,
  HISTORY_COMPACTION_PREAMBLE,
} from "../compression/history-prompts";

export interface ConversationCompressOptions {
  /** flash 摘要器；缺省时直接走丢弃最旧兜底 */
  summarizer?: Summarizer;
  /** 完整历史文件路径（<userData>/sessions/<id>/session.jsonl），拼进摘要供模型回看原文 */
  sessionJsonlPath: string;
  /** 保留最近消息比例（取自 CompressionConfig.compressKeepRatio） */
  keepRatio: number;
}

export interface ConversationCompressionResult {
  compacted: boolean;
  /** 被替换掉的旧消息数量 */
  removedCount: number;
  /** 压缩后会话消息总数 */
  keptCount: number;
  /** 合成摘要消息正文字符数 */
  summaryChars: number;
  reason: "ok" | "fallback-dropped" | "nothing-to-compact";
}

export class ConversationContext implements ContextModule {
  private messages: Message[] = [];

  constructor(initialMessages: Message[] = []) {
    for (const msg of initialMessages) {
      this.appendMessage(msg);
    }
  }

  /**
   * 从 session.jsonl 异步构造一个已恢复完整历史的 ConversationContext。
   * 文件不存在（ENOENT，由 parseJsonl 容错）或为空时，返回不含历史的实例。
   */
  static async createFromSession(sessionPath: string): Promise<ConversationContext> {
    const parseResult = await parseJsonl(sessionPath);
    const { messages } = sessionEventsToMessages(parseResult.events);
    return new ConversationContext(messages);
  }

  appendMessage(message: Message): void {
    if (message.role === "assistant") {
      const hasTools = message.content.some((c) => c.type === "toolCall");
      if (hasTools) {
        message.priority ??= MessagePriority.HIGH;
      }
    }
    if (message.role === "toolResult") {
      message.priority ??= MessagePriority.HIGH;
    }
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return this.messages;
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
  }

  /**
   * 执行一次历史压缩（充血入口）：planCompaction → 摘要 → applyCompaction 一条龙。
   *
   * 调用方（ContextManager）只负责决定「要不要压」（token 阈值 + 调用间隔防抖），
   * 「怎么压」全部在这里：把较旧的可压区序列化后交 flash 做 8 节结构化摘要，
   * 用一条合成 UserMessage（source:"compaction"）替换可压区，正文 = 开篇语 + 摘要 +
   * session.jsonl 绝对路径（模型可 read_file 回看被压缩的原始对话）。
   *
   * 兜底：summarizer 缺省/失败时不抛错——改用「丢弃最旧 + 仅留指向 session.jsonl
   * 的指针消息」，既降 token 又保留回看入口，不阻塞主循环。
   *
   * 设计事实来源：docs/design-docs/model-context/agent-context-compression.md「压缩算法」。
   */
  async compress(options: ConversationCompressOptions): Promise<ConversationCompressionResult> {
    const { summarizer, sessionJsonlPath, keepRatio } = options;

    const plan = this.planCompaction(keepRatio);
    if (!plan) {
      return {
        compacted: false,
        removedCount: 0,
        keptCount: this.getMessageCount(),
        summaryChars: 0,
        reason: "nothing-to-compact",
      };
    }

    let body: string;
    let reason: ConversationCompressionResult["reason"];

    if (summarizer) {
      try {
        const summary = await summarizer.summarizeHistory(serializeMessagesForSummary(plan.removed));
        body = buildCompactionMessageBody(summary, sessionJsonlPath);
        reason = "ok";
      } catch {
        body = buildFallbackBody(plan.removed.length, sessionJsonlPath);
        reason = "fallback-dropped";
      }
    } else {
      body = buildFallbackBody(plan.removed.length, sessionJsonlPath);
      reason = "fallback-dropped";
    }

    const removed = this.applyCompaction(buildCompactionMessage(body), plan.split);

    return {
      compacted: removed.length > 0,
      removedCount: removed.length,
      keptCount: this.getMessageCount(),
      summaryChars: body.length,
      reason,
    };
  }

  /**
   * 规划一次历史压缩（只读，不改 messages）。compress() 的第一步；
   * 保持 public 是为了让切点策略可以被独立单测。
   *
   * 切点策略：保留最近 `keepRatio` 比例的消息为「不动区」，其余较旧消息为「可压区」。
   * 切点落在完整工具配对之后、且让不动区以 assistant turn 开头——既不拆 `tool_call/tool`
   * 配对，又能与合成的 user 摘要消息天然形成 user→assistant 交替（Anthropic 格式要求
   * 严格交替，连续两条 user 会被拒）。最近的 user 提问位于尾部、本就在不动区，不受影响。
   *
   * @returns `{ split, removed }`：split 为可压区结束/不动区起始下标，removed 为可压区消息；
   *          无可压区（历史太短或找不到安全切点）时返回 null。
   */
  planCompaction(keepRatio: number): { split: number; removed: Message[] } | null {
    const total = this.messages.length;
    if (total === 0) return null;

    const clamped = Math.min(Math.max(keepRatio, 0), 1);
    const target = Math.floor(total * (1 - clamped));
    if (target <= 0) return null;

    const split = this.findCompactionSplit(target);
    if (split <= 0 || split >= total) return null;

    return { split, removed: this.messages.slice(0, split) };
  }

  /**
   * 提交一次历史压缩：用合成摘要消息替换 `messages[0..split)`。
   *
   * 与 planCompaction 配对使用，二者之间不应有并发的 appendMessage（Agent loop 内串行 await）。
   * split 越界时不动数组、返回 []，避免误伤。
   */
  applyCompaction(summary: Message, split: number): Message[] {
    if (split <= 0 || split > this.messages.length) return [];
    const removed = this.messages.slice(0, split);
    this.messages = [summary, ...this.messages.slice(split)];
    return removed;
  }

  /**
   * 从 target 下标向后寻找安全切点：
   * 1. 优先返回第一条 assistant 消息下标（不动区以 assistant turn 开头，
   *    与合成 user 摘要消息交替，且不会拆开 tool_call/tool 配对）。
   * 2. 兜底返回第一条非 toolResult 下标（至少避免不动区以孤儿 toolResult 开头）。
   */
  private findCompactionSplit(target: number): number {
    for (let i = target; i < this.messages.length; i++) {
      if (this.messages[i].role === "assistant") return i;
    }
    for (let i = target; i < this.messages.length; i++) {
      if (this.messages[i].role !== "toolResult") return i;
    }
    return this.messages.length;
  }

  format(): ContextParts {
    return {
      systemParts: [],
      messages: [...this.messages],
    };
  }
}

/** 合成替换可压区的摘要消息（source:"compaction" 让 UI/统计单独成桶）。 */
function buildCompactionMessage(body: string): UserMessage {
  return {
    role: "user",
    content: body,
    timestamp: Date.now(),
    source: "compaction",
    priority: MessagePriority.HIGH,
  };
}

/** 摘要不可用时的兜底正文：丢弃最旧内容，仅保留指向 session.jsonl 的回看指针。 */
function buildFallbackBody(droppedCount: number, sessionJsonlPath: string): string {
  return `${HISTORY_COMPACTION_PREAMBLE}\n\n[摘要模型不可用，已直接丢弃较旧的 ${droppedCount} 条消息以释放上下文。]${historyRecoveryFooter(sessionJsonlPath)}`;
}
