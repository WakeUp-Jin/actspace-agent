import type { ModelApi } from "./model-config";

/** 设置页统一的思考档位词表。顺序即从低到高。 */
export const THINKING_LEVELS = ["off", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/** levels 为空数组表示模型不支持思考；default 必须属于 levels。 */
export type ModelThinking = { levels: ThinkingLevel[]; default?: ThinkingLevel };

/**
 * 模型目录（models.dev / OpenRouter）只告诉我们「能不能思考」，不给档位。
 * 这张表按模型 id 补上档位和默认档；按顺序匹配，第一条命中即用。
 * id 先去掉 `vendor/` 前缀并转小写，OpenRouter 的点号版本（4.5）和官方的连字符版本（4-5）都能命中。
 */
const PROFILES: ReadonlyArray<readonly [RegExp, ModelThinking]> = [
  [/^claude-(opus-(4[-.][7-9]|5)|fable)/, { levels: ["off", "low", "medium", "high", "xhigh", "max"], default: "high" }],
  [/^claude-(opus|sonnet)/, { levels: ["off", "low", "medium", "high", "max"], default: "high" }],
  [/^claude-haiku/, { levels: ["off", "low", "medium", "high"], default: "off" }],
  [/^gpt-5[-.]?\d*-(mini|nano)|^o\d/, { levels: ["low", "medium", "high"], default: "medium" }],
  [/^gpt-(5|6)/, { levels: ["low", "medium", "high", "xhigh"], default: "medium" }],
  [/^deepseek-(v4|flash|reasoner|r1)/, { levels: ["off", "low", "high", "max"], default: "high" }],
  [/^kimi/, { levels: ["off", "high"], default: "high" }],
  [/^glm/, { levels: ["off", "high"], default: "high" }],
  [/^minimax/, { levels: ["high"], default: "high" }],
  [/^(qwen|mimo|doubao)/, { levels: ["off", "high"], default: "high" }],
  [/^gemini-[\d.]+-pro/, { levels: ["low", "medium", "high"], default: "high" }],
  [/^gemini/, { levels: ["off", "low", "medium", "high"], default: "medium" }],
  [/^grok/, { levels: ["high"], default: "high" }],
];

/** 目录说能思考、上表又没命中时，按协议给一个保守的档位集合。 */
const PROTOCOL_FALLBACK: Record<ModelApi, ModelThinking> = {
  "anthropic-messages": { levels: ["off", "low", "medium", "high"], default: "high" },
  "openai-responses": { levels: ["low", "medium", "high"], default: "medium" },
  "openai-completions": { levels: ["off", "high"], default: "high" },
};

export function thinkingProfileFor(apiModel: string, protocol: ModelApi): ModelThinking {
  const id = apiModel.split("/").pop()!.toLowerCase().replace(/:.*$/, "");
  const hit = PROFILES.find(([pattern]) => pattern.test(id))?.[1] ?? PROTOCOL_FALLBACK[protocol];
  return cloneThinking(hit);
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

/** 补齐/校正默认档：缺省或不在 levels 里时，优先 high，再取中间一档。 */
export function normalizeThinking(thinking: ModelThinking): ModelThinking {
  const levels = THINKING_LEVELS.filter((level) => thinking.levels.includes(level));
  if (!levels.length) return { levels: [] };
  if (thinking.default && levels.includes(thinking.default)) return { levels, default: thinking.default };
  const on = levels.filter((level) => level !== "off");
  const fallback = on.includes("high") ? "high" : on[Math.floor(on.length / 2)] ?? levels[0];
  return { levels, default: fallback };
}

export function cloneThinking(thinking: ModelThinking): ModelThinking {
  return { levels: [...thinking.levels], ...(thinking.default ? { default: thinking.default } : {}) };
}
