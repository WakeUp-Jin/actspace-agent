/**
 * 消息可视化转换：把一段回复 Markdown 用主模型转成一份自包含 HTML 文档。
 *
 * 见 `docs/design-docs/frontend-ui/消息可视化转换规范.md`。约束：
 * - 复用 `buildAgentConfig` 解析主模型与 apiKey（与正常 turn 同一套 env 来源）。
 * - 单次 `llm.complete`，不进入 agent loop、不带工具。
 * - 产物是「半可信」HTML，由 renderer 侧 sandbox iframe 渲染（不在这里做安全清洗）。
 * - 调用成本敏感：缓存与「只生成一次」由 main 侧负责，这里只管「生成一次」。
 */

import type { ModelId } from "@actspace/shared";
import { buildAgentConfig } from "../engine";
import { createLLMService } from "../llm/factory";
import { getTextContent, type Context } from "../messages";

export interface ConvertReplyToHtmlInput {
  /** 回复 Markdown 原文 */
  content: string;
  /** workspace 根目录（buildAgentConfig 需要） */
  workspaceRoot: string;
  /** 指定模型；缺省走默认主模型 */
  model?: ModelId;
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

export async function convertReplyToHtml(input: ConvertReplyToHtmlInput): Promise<ConvertReplyToHtmlResult> {
  const config = buildAgentConfig({ model: input.model }, input.workspaceRoot);
  const llm = createLLMService(config.llmConfig);

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input.content), timestamp: Date.now() }],
  };

  const message = await llm.complete(context, { signal: input.signal });
  const html = extractHtmlDocument(getTextContent(message));

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
