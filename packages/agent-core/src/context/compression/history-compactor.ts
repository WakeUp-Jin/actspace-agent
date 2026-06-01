/**
 * HistoryCompactor — 历史会话压缩
 *
 * 作用于 ConversationContext：把较旧的可压区序列化后交 flash 8 节结构化摘要，
 * 用一条合成 UserMessage（source:"compaction"）替换可压区，正文 = 开篇语 + 摘要 +
 * 该会话 session.jsonl 绝对路径（模型可 read_file 回看被压缩的原始对话）。
 *
 * 兜底：summarizer 不可用/失败时不抛错——改用「丢弃最旧 + 仅留指向 session.jsonl 的指针消息」，
 * 既降 token 又保留回看入口，不阻塞主循环。
 *
 * 设计事实来源：docs/design-docs/agent-context-compression.md「压缩算法」。
 */

import type { Message, UserMessage } from "../../messages";
import { MessagePriority, getMessageText } from "../../messages";
import type { ConversationContext } from "../modules/conversation";
import type { Summarizer } from "./summarizer";
import { buildCompactionMessageBody, historyRecoveryFooter, HISTORY_COMPACTION_PREAMBLE } from "./history-prompts";

export interface HistoryCompactionInput {
  conversation: ConversationContext;
  /** flash 摘要器；缺省时直接走丢弃最旧兜底 */
  summarizer?: Summarizer;
  /** 完整历史文件路径（<userData>/sessions/<id>/session.jsonl） */
  sessionJsonlPath: string;
  /** 保留最近消息比例（默认取自 CompressionConfig.compressKeepRatio） */
  keepRatio: number;
}

export interface HistoryCompactionResult {
  compacted: boolean;
  /** 被替换掉的旧消息数量 */
  removedCount: number;
  /** 压缩后会话消息总数 */
  keptCount: number;
  /** 合成摘要消息正文字符数 */
  summaryChars: number;
  reason: "ok" | "fallback-dropped" | "nothing-to-compact";
}

/** 把一段消息序列化为可读文本，供摘要模型消费（保留角色、文本、工具名与参数、工具结果）。 */
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

function buildCompactionMessage(body: string): UserMessage {
  return {
    role: "user",
    content: body,
    timestamp: Date.now(),
    source: "compaction",
    priority: MessagePriority.HIGH,
  };
}

/**
 * 执行一次历史压缩。调用前应已确认 token 水位超阈值（由 ContextManager.compactIfNeeded 判断）。
 */
export async function compactHistory(
  input: HistoryCompactionInput,
): Promise<HistoryCompactionResult> {
  const { conversation, summarizer, sessionJsonlPath, keepRatio } = input;

  const plan = conversation.planCompaction(keepRatio);
  if (!plan) {
    return { compacted: false, removedCount: 0, keptCount: conversation.getMessageCount(), summaryChars: 0, reason: "nothing-to-compact" };
  }

  let body: string;
  let reason: HistoryCompactionResult["reason"];

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

  const removed = conversation.applyCompaction(buildCompactionMessage(body), plan.split);

  return {
    compacted: removed.length > 0,
    removedCount: removed.length,
    keptCount: conversation.getMessageCount(),
    summaryChars: body.length,
    reason,
  };
}

/** 摘要不可用时的兜底正文：丢弃最旧内容，仅保留指向 session.jsonl 的回看指针。 */
function buildFallbackBody(droppedCount: number, sessionJsonlPath: string): string {
  return `${HISTORY_COMPACTION_PREAMBLE}\n\n[摘要模型不可用，已直接丢弃较旧的 ${droppedCount} 条消息以释放上下文。]${historyRecoveryFooter(sessionJsonlPath)}`;
}
