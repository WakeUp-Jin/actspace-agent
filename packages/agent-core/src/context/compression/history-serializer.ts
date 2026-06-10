/**
 * 历史消息序列化 — 压缩工具库的纯函数部分
 *
 * 把一段 Message 序列化为可读文本供摘要模型消费。被 ConversationContext.compress()
 * 调用；本目录（compression/）只提供无状态工具与 prompt 资产，压缩的编排权在
 * 数据所有者模块自身（modules/conversation）。
 */

import type { Message } from "../../messages";
import { getMessageText } from "../../messages";

/** 把一段消息序列化为可读文本（保留角色、文本、工具名与参数、工具结果）。 */
export function serializeMessagesForSummary(messages: Message[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`【用户】${getMessageText(msg)}`);
      continue;
    }
    if (msg.role === "assistant") {
      const text = getMessageText(msg);
      if (text.trim()) lines.push(`【助手】${text}`);
      for (const part of msg.content) {
        if (part.type === "toolCall") {
          lines.push(`【工具调用】${part.name}(${safeJson(part.arguments)})`);
        }
      }
      continue;
    }
    // toolResult
    const prefix = msg.isError ? "【工具失败】" : "【工具结果】";
    lines.push(`${prefix}${msg.toolName}: ${getMessageText(msg)}`);
  }
  return lines.join("\n");
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return String(value);
  }
}
