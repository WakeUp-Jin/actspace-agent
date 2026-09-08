import type { ContextUsageBucketName } from "@actspace/shared";

const CONTEXT_LABELS: Record<ContextUsageBucketName, string> = {
  systemPrompt: "系统提示词",
  tools: "工具",
  rules: "规则",
  skills: "Skills",
  summarizedConversation: "会话摘要",
  conversation: "会话内容",
};

export function contextBucketLabel(key: string): string {
  return Object.hasOwn(CONTEXT_LABELS, key) ? CONTEXT_LABELS[key as ContextUsageBucketName] : key;
}
