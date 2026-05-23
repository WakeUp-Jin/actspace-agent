/**
 * ConversationContext — V0 极简会话历史模块
 *
 * 直接管理 messages 数组，无持久化、无 turn 标记。
 * V1 将被 ShortTermMemoryContext 替换（带持久化和 turn 标记）。
 *
 * format() 返回空 systemParts + 完整 messages 列表。
 * ContextManager 使用 ConversationContext 中的 messages 作为主要消息来源。
 */

import type { Message } from "../../messages";
import { MessagePriority } from "../../messages";
import type { ContextModule, ContextParts } from "../types";

export class ConversationContext implements ContextModule {
  private messages: Message[] = [];

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
