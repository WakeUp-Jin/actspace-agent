import { getTextContent, getToolCalls } from "../../messages";
import { env } from "../../env";
import { KimiService } from "../services/kimi";
import type { APIContentPart, APIMessage } from "../types";
import { WEB_SEARCH_SYSTEM_PROMPT } from "./prompts/web-search";
import { WEB_FETCH_SYSTEM_PROMPT } from "./prompts/web-fetch";
import { ANALYZE_MEDIA_SYSTEM_PROMPT } from "./prompts/analyze-media";
import type {
  AnalyzeMediaInput,
  AnalyzeMediaResult,
  KimiAssistantConfig,
  WebFetchResult,
  WebSearchResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_PAGE_TEXT_CHARS = 24_000;

export function createKimiAssistantConfigFromEnv(): KimiAssistantConfig {
  return {
    apiKey: env.KIMI_API_KEY,
    baseUrl: env.KIMI_BASE_URL || "https://api.moonshot.ai/v1",
    model: env.KIMI_MODEL || "kimi-k2.6",
    temperature: 0,
    maxTokens: 2048,
  };
}

export async function searchWithKimi(
  query: string,
  config = createKimiAssistantConfigFromEnv(),
): Promise<WebSearchResult> {
  const service = createKimiService(config);
  const messages: APIMessage[] = [
    { role: "system", content: WEB_SEARCH_SYSTEM_PROMPT },
    { role: "user", content: query },
  ];

  const first = await service.streamWithBuiltinWebSearch(messages, {
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  }).result();

  const toolCalls = getToolCalls(first);
  if (toolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: getTextContent(first) || null,
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments),
        },
      })),
    });

    for (const toolCall of toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify(toolCall.arguments),
      });
    }
  }

  const finalMessage = toolCalls.length > 0
    ? await service.streamWithBuiltinWebSearch(messages, {
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      }).result()
    : first;

  return {
    query,
    answer: getTextContent(finalMessage),
    searchedAt: new Date().toISOString(),
  };
}

export async function fetchAndSummarizeWithKimi(
  url: string,
  prompt?: string,
  config = createKimiAssistantConfigFromEnv(),
): Promise<WebFetchResult> {
  const page = await fetchPageText(url);
  const service = createKimiService(config);
  const userPrompt = [
    prompt ? `User focus:\n${prompt}` : "User focus:\nSummarize the page for a downstream coding assistant.",
    `URL:\n${url}`,
    page.title ? `Title:\n${page.title}` : "",
    `Page text:\n${page.text.slice(0, MAX_PAGE_TEXT_CHARS)}`,
  ].filter(Boolean).join("\n\n");

  const message = await service.completeMessages([
    { role: "system", content: WEB_FETCH_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ], {
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  return {
    url,
    title: page.title,
    summary: getTextContent(message),
    fetchedAt: new Date().toISOString(),
  };
}

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
  ], {
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  return {
    summary: getTextContent(message),
    analyzedAt: new Date().toISOString(),
  };
}

function createKimiService(config: KimiAssistantConfig): KimiService {
  return new KimiService({
    provider: "kimi",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
}

async function fetchPageText(url: string): Promise<{ title?: string; text: string }> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "actspace-agent/0.1",
        Accept: "text/html,text/plain,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP ${response.status}`);
    }

    const raw = (await response.text()).slice(0, MAX_PAGE_TEXT_CHARS * 2);
    return htmlToText(raw);
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(raw: string): { title?: string; text: string } {
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: title?.replace(/\s+/g, " ").trim(),
    text,
  };
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
