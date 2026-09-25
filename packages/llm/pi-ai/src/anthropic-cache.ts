import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

type AnthropicParams = Record<string, RuntimeV2JsonValue>;
type JsonRecord = Record<string, RuntimeV2JsonValue>;

const CACHE_CONTROL = { type: "ephemeral" } as const;

export function applyAnthropicPromptCache(
  params: AnthropicParams,
  retention: "short" | "none" | undefined,
): AnthropicParams {
  if (retention === "none") return params;
  const next = { ...params };
  const system = params.system;
  if (typeof system === "string" && system.length > 0) {
    next.system = [{ type: "text", text: system, cache_control: CACHE_CONTROL }];
  } else if (Array.isArray(system)) {
    next.system = markLastEligibleBlock(system);
  }

  if (Array.isArray(params.tools) && params.tools.length > 0) {
    const lastToolIndex = params.tools.length - 1;
    next.tools = params.tools.map((tool, index) => index === lastToolIndex && isRecord(tool)
      ? { ...tool, cache_control: CACHE_CONTROL }
      : tool);
  }

  if (Array.isArray(params.messages)) {
    const messages = params.messages.map((message) => isRecord(message) ? { ...message } : message);
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!isRecord(message) || message.role !== "user") continue;
      if (typeof message.content === "string") {
        messages[index] = { ...message, content: [{ type: "text", text: message.content, cache_control: CACHE_CONTROL }] };
      } else if (Array.isArray(message.content)) {
        messages[index] = { ...message, content: markLastEligibleBlock(message.content) };
      }
      break;
    }
    next.messages = messages;
  }
  return next;
}

function markLastEligibleBlock(blocks: RuntimeV2JsonValue[]): RuntimeV2JsonValue[] {
  const next = blocks.map((block) => isRecord(block) ? { ...block } : block);
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const block = next[index];
    if (!isRecord(block) || !["text", "image", "tool_result"].includes(String(block.type ?? ""))) continue;
    next[index] = { ...block, cache_control: CACHE_CONTROL };
    break;
  }
  return next;
}

function isRecord(value: RuntimeV2JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
