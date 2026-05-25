/**
 * Kimi 辅助能力：web_search / analyze_media
 *
 * DeepSeek 作为主模型时，通过 Kimi 提供联网搜索和多模态分析。
 * web_search 统一处理关键词搜索和 URL 读取（利用 $web_search 内置的 search + crawl 能力）。
 */

import { getTextContent, getToolCalls } from "../messages";
import { env } from "../env";
import { KimiService } from "./services/kimi";
import type { APIContentPart, APIMessage, LLMConfig } from "./types";
import {
  ANALYZE_MEDIA_SYSTEM_PROMPT,
  WEB_SEARCH_SYSTEM_PROMPT,
} from "../prompt/kimi-assistants";

// ─── 类型定义 ───

export interface KimiAssistantConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface WebSearchResult {
  query: string;
  answer: string;
  searchedAt: string;
}


export interface AnalyzeMediaInput {
  source: string;
  mimeType?: string;
  prompt?: string;
}

export interface AnalyzeMediaResult {
  summary: string;
  analyzedAt: string;
}

// ─── 配置 ───


export function createKimiAssistantConfigFromEnv(): KimiAssistantConfig {
  return {
    apiKey: env.KIMI_API_KEY,
    baseUrl: env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
    model: env.KIMI_MODEL || "kimi-k2.6",
  };
}

// ─── 搜索 ───

export async function searchWithKimi(
  query: string,
  config = createKimiAssistantConfigFromEnv(),
): Promise<WebSearchResult> {
  const service = createKimiService(config);
  const messages: APIMessage[] = [
    { role: "system", content: WEB_SEARCH_SYSTEM_PROMPT },
    { role: "user", content: query },
  ];

  const first = await service.streamWithBuiltinWebSearch(messages, {}).result();

  // If the first response has an error, propagate it
  if (first.stopReason === "error") {
    return {
      query,
      answer: "",
      searchedAt: new Date().toISOString(),
    };
  }

  // If the first response already has text content, use it directly
  const firstText = getTextContent(first);
  if (firstText) {
    return {
      query,
      answer: firstText,
      searchedAt: new Date().toISOString(),
    };
  }

  // If Kimi returned builtin tool_calls (server-side search was executed),
  // acknowledge with empty tool results and request final answer
  const toolCalls = getToolCalls(first);
  if (toolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    });

    // 文档要求：将 tool_call.function.arguments 原封不动地提交给 Kimi
    for (const tc of toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(tc.arguments),
      });
    }

    const finalMessage = await service.streamWithBuiltinWebSearch(messages, {}).result();

    const finalText = getTextContent(finalMessage);
    return {
      query,
      answer: finalText || `No search results found for "${query}".`,
      searchedAt: new Date().toISOString(),
    };
  }

  return {
    query,
    answer: `No search results found for "${query}".`,
    searchedAt: new Date().toISOString(),
  };
}


// ─── 多模态分析 ───

export async function analyzeMediaWithKimi(
  input: AnalyzeMediaInput,
  config = createKimiAssistantConfigFromEnv(),
): Promise<AnalyzeMediaResult> {
  const service = createKimiService(config);
  const content: APIContentPart[] = [
    {
      type: "text",
      text: input.prompt || "Analyze this media for a downstream text-only reasoning model.",
    },
    toMediaPart(input),
  ];

  const message = await service.completeMessages([
    { role: "system", content: ANALYZE_MEDIA_SYSTEM_PROMPT },
    { role: "user", content },
  ], {});

  return {
    summary: getTextContent(message),
    analyzedAt: new Date().toISOString(),
  };
}

// ─── 内部工具函数 ───

function createKimiService(config: KimiAssistantConfig): KimiService {
  const llmConfig: LLMConfig = {
    provider: "kimi",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  };
  return new KimiService(llmConfig);
}


function toMediaPart(input: AnalyzeMediaInput): APIContentPart {
  const isVideo = input.mimeType?.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(input.source);
  if (isVideo) {
    return {
      type: "video_url",
      video_url: { url: input.source },
    };
  }

  return {
    type: "image_url",
    image_url: { url: input.source },
  };
}
