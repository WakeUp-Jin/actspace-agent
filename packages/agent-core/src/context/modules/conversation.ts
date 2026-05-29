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
 * 后续 V1 升级为 ShortTermMemoryContext 时仅引入 turn 标记 / 多日切片 / 压缩接入，
 * 构造入口签名（initialMessages / createFromSession）不破坏。
 */

import type { Message } from "../../messages";
import { MessagePriority } from "../../messages";
import { parseJsonl } from "../../persistence/jsonl";
import { sessionEventsToMessages } from "../../adapters";
import type { ContextModule, ContextParts } from "../types";

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
   * 规划一次历史压缩（只读，不改 messages）。
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
