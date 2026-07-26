/**
 * 消息可视化转换：把一段回复 Markdown 用主模型转成一份自包含 HTML 文档。
 *
 * 见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`。约束：
 * - Electron main 先通过 `ModelRuntimeService` 解析主模型与 main-only provider credential，
 *   本模块只消费显式 `LLMConfig`，不自行读取 env / Settings。
 * - 单次 `llm.complete`，不进入 agent loop、不带工具。
 * - 产物是「半可信」HTML，由 renderer 侧 sandbox iframe 渲染（不在这里做安全清洗）。
 * - 调用成本敏感：缓存与「只生成一次」由 main 侧负责，这里只管「生成一次」。
 */

import { createLLMService } from "../llm/factory";
import { LLMServiceError, type LLMConfig, type LLMErrorKind } from "../llm/types";
import { getTextContent, type Context } from "../messages";

export interface ConvertReplyToHtmlInput {
  /** 回复 Markdown 原文 */
  content: string;
  /** 由 Electron main 的 ModelRuntimeService 解析，包含 main-only provider credential。 */
  llmConfig: LLMConfig;
  signal?: AbortSignal;
}

export interface ConvertReplyToHtmlResult {
  html: string;
  model: string;
  provider: string;
  usage: { input: number; output: number; totalTokens: number };
  stopReason: string;
}

const SYSTEM_PROMPT = [
  "You are a renderer that turns a Markdown chat reply into ONE self-contained, visually polished HTML document.",
  "",
  "Hard requirements:",
  "- Output a SINGLE complete HTML document starting with <!doctype html>. Output ONLY the HTML, no prose, no code fences.",
  "- All CSS must be inline in a single <style> tag. Do NOT load any external stylesheet, font, or script.",
  "- Do NOT include <script src>, fetch, XHR, WebSocket, or any network request. No external resources at all.",
  "- Images: only inline data: URIs, or omit. Never hotlink external URLs.",
  "- Preserve the reply's meaning and structure faithfully; improve readability with clear hierarchy, spacing, cards, and tables where helpful.",
  "- Support light and dark backgrounds: set `:root { color-scheme: light dark; }` and use system-friendly colors (prefer CSS that adapts via prefers-color-scheme).",
  "- Keep it accessible and self-contained so it renders correctly inside a sandboxed iframe with a strict CSP.",
].join("\n");

function buildUserPrompt(content: string): string {
  return [
    "Convert the following Markdown reply into a self-contained HTML document per the rules.",
    "",
    "----- BEGIN MARKDOWN -----",
    content,
    "----- END MARKDOWN -----",
  ].join("\n");
}

/** 从模型输出里抽出 HTML 文档：剥掉 ```html 围栏 / 前后噪声，兜底原样返回。 */
export function extractHtmlDocument(raw: string): string {
  const text = raw.trim();

  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    return fenced[1].trim();
  }

  const docIndex = text.search(/<!doctype html|<html[\s>]/i);
  if (docIndex >= 0) {
    return text.slice(docIndex).trim();
  }

  return text;
}

/** 可缓存、可渲染的可视化产物必须是一份完整 HTML 文档。 */
export function isCompleteHtmlDocument(html: string): boolean {
  const text = html.trim();
  return /^<!doctype html>/i.test(text) && /<html[\s>]/i.test(text) && /<\/html>\s*$/i.test(text);
}

function normalizeErrorKind(value: string | undefined): LLMErrorKind {
  switch (value) {
    case "proxy":
    case "network":
    case "rate_limit":
    case "auth":
    case "insufficient_balance":
    case "invalid_request":
    case "server_error":
      return value;
    default:
      return "unknown";
  }
}

export async function convertReplyToHtml(input: ConvertReplyToHtmlInput): Promise<ConvertReplyToHtmlResult> {
  const llm = createLLMService(input.llmConfig);

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input.content), timestamp: Date.now() }],
  };

  const message = await llm.complete(context, { signal: input.signal });
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new LLMServiceError(
      message.errorMessage ?? (message.stopReason === "aborted" ? "可视化生成已取消。" : "可视化模型调用失败。"),
      normalizeErrorKind(message.errorKind),
      message.errorRetryable ?? false,
    );
  }
  if (message.stopReason !== "stop") {
    throw new LLMServiceError(
      `可视化 HTML 生成未完整结束（${message.stopReason}），请重试。`,
      "server_error",
      true,
    );
  }

  const html = extractHtmlDocument(getTextContent(message));
  if (!isCompleteHtmlDocument(html)) {
    throw new LLMServiceError("模型没有返回完整的 HTML 文档，请重试。", "server_error", true);
  }

  return {
    html,
    model: message.model,
    provider: message.provider,
    usage: {
      input: message.usage.input,
      output: message.usage.output,
      totalTokens: message.usage.totalTokens,
    },
    stopReason: message.stopReason,
  };
}
