/**
 * Summarizer — flash 模型摘要封装
 *
 * 统一封装「工具输出摘要」与「历史会话摘要」两种调用：内部用一个独立的
 * LLMService（通常是 deepseek-v4-flash）执行 complete，按用途选择 system prompt。
 *
 * 失败策略：内部 try/catch，把任何 LLM 失败包成 SummarizerUnavailableError 抛出，
 * 由调用方（OutputTruncator / HistoryCompactor）兜底为确定性截断/丢弃，不阻塞主流程。
 *
 * 构造（buildLLMConfig + createLLMService）在 engine/create-agent-deps.ts 完成，
 * 本模块只吃一个现成的 LLMService，避免 context → engine 的循环依赖。
 *
 * 设计事实来源：docs/design-docs/model-context/agent-context-compression.md。
 */

import type { ToolPreviewKind } from "@actspace/shared";
import type { Context } from "../../messages";
import { MessagePriority, getTextContent } from "../../messages";
import type { LLMService } from "../../llm/types";
import { toolSummarySystemPrompt } from "./tool-summary-prompts";
import { HISTORY_COMPACTION_SYSTEM_PROMPT } from "./history-prompts";

export class SummarizerUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SummarizerUnavailableError";
  }
}

export interface Summarizer {
  /** 用按工具类型选择的 prompt 摘要单个工具输出。 */
  summarizeToolOutput(kind: ToolPreviewKind, input: string): Promise<string>;
  /** 用 8 节结构化 prompt 摘要序列化后的历史会话。 */
  summarizeHistory(serialized: string): Promise<string>;
}

async function completeWith(
  llm: LLMService,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const context: Context = {
    systemPrompt,
    messages: [
      {
        role: "user",
        content: userContent,
        timestamp: Date.now(),
        priority: MessagePriority.NORMAL,
      },
    ],
  };

  let text: string;
  try {
    const reply = await llm.complete(context);
    if (reply.stopReason === "error" || reply.stopReason === "aborted") {
      throw new SummarizerUnavailableError(
        `summarizer stream ended with stopReason=${reply.stopReason}`,
        reply.errorMessage,
      );
    }
    text = getTextContent(reply).trim();
  } catch (err) {
    if (err instanceof SummarizerUnavailableError) throw err;
    throw new SummarizerUnavailableError("summarizer LLM call failed", err);
  }

  if (!text) {
    throw new SummarizerUnavailableError("summarizer produced empty output");
  }
  return text;
}

/** 从一个现成的 flash LLMService 构造 Summarizer。 */
export function createSummarizer(llm: LLMService): Summarizer {
  return {
    summarizeToolOutput(kind, input) {
      return completeWith(llm, toolSummarySystemPrompt(kind), input);
    },
    summarizeHistory(serialized) {
      return completeWith(llm, HISTORY_COMPACTION_SYSTEM_PROMPT, serialized);
    },
  };
}
