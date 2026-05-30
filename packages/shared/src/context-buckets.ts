/**
 * Context bucket 单一配置注册表（单一事实来源）。
 *
 * 「改配置不改代码」：新增一种上下文类型时，只在这里加一行，并在
 * `packages/desktop/src/renderer/styles/tokens.css` 加一个对应的主题色 token。
 * 后端 bucket 生成（`agent-core/context/token-estimator.ts`）与前端 Context 弹窗
 * （`desktop/renderer/components/ContextPopup.tsx`）都从这里取展示信息，未知 key 走兜底，
 * 不需要改组件代码。
 */

export const CONTEXT_BUCKET_REGISTRY = [
  { key: "systemPrompt", label: "System prompt", order: 10, colorVar: "--act-context-system" },
  { key: "tools", label: "Tools", order: 20, colorVar: "--act-context-tools" },
  { key: "rules", label: "Rules", order: 30, colorVar: "--act-context-rules" },
  { key: "skills", label: "Skills", order: 40, colorVar: "--act-context-skills" },
  { key: "summarizedConversation", label: "Summarized conversation", order: 50, colorVar: "--act-context-summarized" },
  { key: "conversation", label: "Conversation", order: 60, colorVar: "--act-context-conversation" },
] as const;

export type ContextBucketConfig = (typeof CONTEXT_BUCKET_REGISTRY)[number];

/** bucket key 联合类型，由注册表派生。新增 bucket 改注册表即可，类型自动跟随。 */
export type ContextUsageBucketName = ContextBucketConfig["key"];

/** 未知 bucket key 的兜底配色 token。 */
export const CONTEXT_BUCKET_FALLBACK_COLOR_VAR = "--act-context-fallback";

export type ContextBucketDisplay = {
  label: string;
  colorVar: string;
  order: number;
};

/**
 * 取某个 bucket 的展示信息。
 * 已知 key 返回注册表配置；未知 key 用 key 本身作 label、兜底配色、末尾排序，保证不崩。
 */
export function getContextBucketDisplay(key: string): ContextBucketDisplay {
  const found = CONTEXT_BUCKET_REGISTRY.find((bucket) => bucket.key === key);
  if (found) {
    return { label: found.label, colorVar: found.colorVar, order: found.order };
  }
  return { label: key, colorVar: CONTEXT_BUCKET_FALLBACK_COLOR_VAR, order: 999 };
}
