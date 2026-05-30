#!/usr/bin/env node

/*
 * Probe whether DeepSeek exposes provider-native web search through:
 * 1. Anthropic-compatible Messages API server tools.
 * 2. OpenAI-compatible Chat Completions search-style parameters.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/probe-deepseek-web-search.js
 *
 * Optional:
 *   DEEPSEEK_ANTHROPIC_MODEL=deepseek-v4-pro \
 *   DEEPSEEK_OPENAI_MODEL=deepseek-v4-pro \
 *   DEEPSEEK_WEB_SEARCH_PROMPT="..." \
 *   node scripts/probe-deepseek-web-search.js
 */

"use strict";

const apiKey = "sk-fbdb84fe22222222ddde28f402a"||process.env.DEEPSEEK_API_KEY;
const prompt =
  process.env.DEEPSEEK_WEB_SEARCH_PROMPT ||
  "读取一下这个url里面有内容，总结一下：https://api-docs.deepseek.com/zh-cn/guides/anthropic_api";

const anthropicBaseUrl =
  process.env.DEEPSEEK_ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic";
const openaiBaseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const anthropicModel = process.env.DEEPSEEK_ANTHROPIC_MODEL || "deepseek-v4-pro";
const openaiModel = process.env.DEEPSEEK_OPENAI_MODEL || "deepseek-v4-pro";

if (!apiKey) {
  console.error("Missing DEEPSEEK_API_KEY. Example:");
  console.error("  DEEPSEEK_API_KEY=sk-... node scripts/probe-deepseek-web-search.js");
  process.exit(1);
}

if (typeof fetch !== "function") {
  console.error("This script requires Node.js with global fetch support. Use Node 18+.");
  process.exit(1);
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function redactHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      ["authorization", "x-api-key", "api-key"].includes(key.toLowerCase())
        ? "<redacted>"
        : value,
    ]),
  );
}

async function postJson({ label, url, headers, body }) {
  console.log(`\n=== ${label} ===`);
  console.log(`POST ${url}`);
  console.log("Headers:", JSON.stringify(redactHeaders(headers), null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = parseJson(text);

  console.log(`Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    console.log("Error body:");
    console.log(formatPayload(parsed ?? text));
    return { ok: false, status: response.status, payload: parsed ?? text };
  }

  console.log("Response summary:");
  console.log(formatPayload(summarizePayload(parsed)));
  return { ok: true, status: response.status, payload: parsed };
}

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatPayload(payload) {
  if (typeof payload === "string") {
    return payload.length > 4000 ? `${payload.slice(0, 4000)}\n...<truncated>` : payload;
  }

  return JSON.stringify(payload, null, 2);
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (Array.isArray(payload.content)) {
    return summarizeAnthropicPayload(payload);
  }

  if (Array.isArray(payload.choices)) {
    return summarizeOpenAiPayload(payload);
  }

  return payload;
}

function summarizeAnthropicPayload(payload) {
  const blockTypes = payload.content.map((block) => block?.type).filter(Boolean);
  const textBlocks = payload.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => ({
      text: trimLong(block.text),
      citations: block.citations ?? [],
    }));

  return {
    id: payload.id,
    model: payload.model,
    stop_reason: payload.stop_reason,
    block_types: blockTypes,
    saw_server_tool_use: blockTypes.includes("server_tool_use"),
    saw_web_search_tool_result: blockTypes.includes("web_search_tool_result"),
    text_blocks: textBlocks,
    usage: payload.usage,
  };
}

function summarizeOpenAiPayload(payload) {
  return {
    id: payload.id,
    model: payload.model,
    choices: payload.choices.map((choice) => ({
      index: choice.index,
      finish_reason: choice.finish_reason,
      message: summarizeOpenAiMessage(choice.message),
    })),
    usage: payload.usage,
  };
}

function summarizeOpenAiMessage(message) {
  if (!message || typeof message !== "object") {
    return message;
  }

  return {
    role: message.role,
    content: trimLong(message.content),
    tool_calls: message.tool_calls ?? [],
    annotations: message.annotations ?? [],
  };
}

function trimLong(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.length > 1800 ? `${value.slice(0, 1800)}\n...<truncated>` : value;
}

function explainAnthropicResult(result) {
  console.log("\nAnthropic probe verdict:");

  if (!result.ok) {
    console.log("- Request failed. If the error mentions tools/content block support, DeepSeek likely does not expose Anthropic web search server tools yet.");
    return;
  }

  const content = Array.isArray(result.payload?.content) ? result.payload.content : [];
  const blockTypes = content.map((block) => block?.type);

  if (blockTypes.includes("server_tool_use") || blockTypes.includes("web_search_tool_result")) {
    console.log("- Web search server-tool blocks were present. Anthropic-compatible web search appears to be wired up.");
    return;
  }

  console.log("- No server_tool_use or web_search_tool_result blocks were returned.");
  console.log("- That usually means the model answered without using web search, or the provider ignored/rejected the server tool silently.");
}

function explainOpenAiResult(result) {
  console.log("\nOpenAI probe verdict:");

  if (!result.ok) {
    console.log("- Request failed. This is expected if DeepSeek does not support OpenAI-style native web search parameters.");
    return;
  }

  const choices = Array.isArray(result.payload?.choices) ? result.payload.choices : [];
  const annotations = choices.flatMap((choice) => choice?.message?.annotations ?? []);
  const toolCalls = choices.flatMap((choice) => choice?.message?.tool_calls ?? []);

  if (annotations.length > 0 || toolCalls.length > 0) {
    console.log("- The response included annotations or tool calls. Inspect the summary above to confirm whether they are real web-search evidence.");
    return;
  }

  console.log("- The request succeeded, but no search annotations/tool calls were returned.");
  console.log("- This likely means the OpenAI-compatible endpoint treated the request as normal chat or ignored unsupported search options.");
}

async function probeAnthropicWebSearch() {
  return postJson({
    label: "Anthropic-compatible web_search_20250305",
    url: joinUrl(anthropicBaseUrl, "/v1/messages"),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: anthropicModel,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        },
      ],
    },
  });
}

async function probeOpenAiWebSearchOptions() {
  return postJson({
    label: "OpenAI-compatible chat completions web_search_options",
    url: joinUrl(openaiBaseUrl, "/v1/chat/completions"),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: openaiModel,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1200,
      web_search_options: {
        search_context_size: "low",
      },
    },
  });
}

async function main() {
  console.log("DeepSeek web search capability probe");
  console.log(`Prompt: ${prompt}`);
  console.log(`Anthropic model: ${anthropicModel}`);
  console.log(`OpenAI model: ${openaiModel}`);

  const anthropicResult = await probeAnthropicWebSearch();
  explainAnthropicResult(anthropicResult);

  const openAiResult = await probeOpenAiWebSearchOptions();
  explainOpenAiResult(openAiResult);
}

main().catch((error) => {
  console.error("\nProbe crashed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
