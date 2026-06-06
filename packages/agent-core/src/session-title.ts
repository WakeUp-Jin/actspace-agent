/**
 * 会话标题自动生成
 *
 * 首轮对话结束后，用便宜的 flash 模型把「用户首条输入 + 助手最终回复」浓缩成一句
 * 简短会话标题，替换默认的 "New chat"。
 *
 * 设计取舍：
 * - 纯函数 `generateSessionTitle(llm, input)` 只吃一个现成的 LLMService（通常是 flash），
 *   不在此构造模型，避免与 engine 形成循环依赖、也便于用 MockLLMService 单测。
 * - 任何失败（LLM 报错 / 空输出）都回落为 null，由调用方保留原标题，绝不阻塞主流程。
 */

import type { Context } from "./messages";
import { MessagePriority, getTextContent } from "./messages";
import type { LLMService } from "./llm/types";

export const SESSION_TITLE_SYSTEM_PROMPT = `你是一个会话标题生成器。根据用户的第一条消息和助手的回复，生成一个简短的会话标题。

要求：
- 只输出标题本身，不要任何解释、引号、标点结尾或前缀。
- 概括这次对话的核心主题，让人一眼看出在聊什么。
- 中文标题控制在 4~12 个字；英文标题控制在 2~6 个词。
- 使用与用户输入一致的语言。`;

/** 默认/占位标题：这些情况下才允许自动覆盖，避免覆盖用户手动改过的标题。 */
export function isDefaultSessionTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (trimmed === "New chat") return true;
  // createMeta 的兜底命名：`Session <id>`。
  return /^Session\s+/i.test(trimmed);
}

/** 清洗模型输出：取首行、去包裹引号、去结尾标点、限长。 */
function sanitizeTitle(raw: string): string | null {
  let title = raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  // 循环剥离包裹引号与结尾标点，处理 `"标题"。` 这类引号与标点交错的情况，直到稳定。
  let previous = "";
  while (title !== previous) {
    previous = title;
    title = title
      .replace(/^["'“”「『]+/, "")
      .replace(/["'“”」』]+$/, "")
      .replace(/[。.!?！？\s]+$/, "")
      .trim();
  }
  if (!title) return null;
  // 兜底限长，避免模型偶发长输出污染侧边栏。
  return title.length > 40 ? title.slice(0, 40).trim() : title;
}

/**
 * 用 flash 模型生成会话标题。失败/空输出返回 null（调用方保留原标题）。
 */
export async function generateSessionTitle(
  llm: LLMService,
  input: { userInput: string; replyText: string },
): Promise<string | null> {
  const userInput = input.userInput.trim();
  if (!userInput) return null;

  const replyText = input.replyText.trim();
  const userContent = replyText
    ? `用户的第一条消息：\n${userInput}\n\n助手的回复：\n${replyText}`
    : `用户的第一条消息：\n${userInput}`;

  const context: Context = {
    systemPrompt: SESSION_TITLE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userContent,
        timestamp: Date.now(),
        priority: MessagePriority.NORMAL,
      },
    ],
  };

  try {
    const reply = await llm.complete(context);
    if (reply.stopReason === "error" || reply.stopReason === "aborted") return null;
    return sanitizeTitle(getTextContent(reply));
  } catch {
    return null;
  }
}
