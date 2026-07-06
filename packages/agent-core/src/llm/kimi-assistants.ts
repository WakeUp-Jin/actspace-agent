/**
 * Kimi 辅助能力：analyze_media
 *
 * DeepSeek 作为主模型时，通过 Kimi 提供多模态分析。
 * （联网搜索已改为独立的 web_search / web_fetch 本地工具，不再经过 Kimi，
 * 见 docs/design-docs/agent-web-tools.md。）
 */

import { getTextContent } from "../messages";
import { env } from "../env";
import { KimiService } from "./services/kimi";
import type { APIContentPart, LLMConfig } from "./types";
import { ANALYZE_MEDIA_SYSTEM_PROMPT } from "../prompt/kimi-assistants";

// ─── 类型定义 ───

export interface KimiAssistantConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
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
