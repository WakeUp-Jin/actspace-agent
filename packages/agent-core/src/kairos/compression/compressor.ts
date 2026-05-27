import type { SessionEvent } from "@actspace/shared";
import { MessagePriority, getTextContent, type Context } from "../../messages";
import type { LLMService } from "../../llm/types";
import {
  buildCompressionUserPrompt,
  getCompressionSystemPrompt,
  type CompressionKind,
} from "./prompts";

export interface CompressKairosSegmentsInput {
  segments: SessionEvent[];
  kind: CompressionKind;
  rangeLabel: string;
  llm: LLMService;
}

export interface CompressKairosSegmentsOutput {
  markdown: string;
}

/**
 * 调用 LLM 把 Kairos 短期记忆压缩为 markdown 摘要。
 *
 * 失败策略：失败直接抛错——controller 在 plan 5 阶段把它作为"非关键路径"
 * 异步发起，失败仅 emit warning + 跳过本轮压缩；本函数不内部 catch。
 */
export async function compressKairosSegments(
  input: CompressKairosSegmentsInput,
): Promise<CompressKairosSegmentsOutput> {
  const body = input.segments
    .map((event) => JSON.stringify(event))
    .join("\n");

  const userPrompt = buildCompressionUserPrompt(input.kind, input.rangeLabel, body);

  const context: Context = {
    systemPrompt: getCompressionSystemPrompt(),
    messages: [
      {
        role: "user",
        content: userPrompt,
        timestamp: Date.now(),
        priority: MessagePriority.NORMAL,
      },
    ],
  };

  const reply = await input.llm.complete(context);
  const text = getTextContent(reply);
  return { markdown: text };
}
