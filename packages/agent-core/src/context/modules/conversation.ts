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

  format(): ContextParts {
    return {
      systemParts: [],
      messages: [...this.messages],
    };
  }
}
