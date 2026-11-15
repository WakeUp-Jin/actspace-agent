import { CHARS_PER_TOKEN } from "@actspace/shared";

/** 给下一次回复留的 token 数；窗口很小时留窗口的四分之一。 */
const NEXT_REPLY_RESERVE_TOKENS = 16_000;

export type ToolBatchBudgetInput = {
  /** 模型的上下文窗口（token）。null 表示不知道。 */
  readonly contextWindow: number | null;
  /** 请求里指定的最大输出 token 数；没指定为 0。 */
  readonly maxOutputTokens: number;
  /** 发出这一批调用的那次请求，加上模型这次的回复，一共占了多少 token。 */
  readonly usedTokens: number;
  /** 其中压缩之后仍然留着的部分：系统提示词、工具定义、发出这一批调用的那条助手消息。 */
  readonly keptTokens: number;
};

/**
 * 一批工具调用给模型的输出合计最多多少字符。自动压缩不压最后一批工具结果，
 * 这一批放不进窗口的话，之后每次请求都发不出去，所以在结果写进会话之前按窗口限制。
 *
 * 两个限制取小的：
 * - 现在还剩多少：窗口 − 留给下一次回复的 − 已经占用的。压缩没成功时，下一次请求也发得出去。
 * - 压缩之后可用空间的一半：旧内容压成摘要后，这一批最多占一半，另一半留给摘要和后面的步骤。
 *
 * 换算用上下文估算的同一个比例（4 个字符 1 token）。中文这类文字实际占的 token 更多，
 * 这里和容量检查一样会低估，没有单独处理。
 * 窗口大小未知时返回 undefined，只受 tool-runtime 的固定上限约束。
 */
export function toolBatchOutputChars(input: ToolBatchBudgetInput): number | undefined {
  const window = input.contextWindow;
  if (window === null || !Number.isFinite(window) || window <= 0) return undefined;
  const reserve = Math.max(input.maxOutputTokens, Math.min(NEXT_REPLY_RESERVE_TOKENS, Math.floor(window / 4)));
  const limit = window - reserve;
  const tokens = Math.min(limit - input.usedTokens, Math.floor((limit - input.keptTokens) / 2));
  return Math.max(0, Math.floor(tokens)) * CHARS_PER_TOKEN;
}
