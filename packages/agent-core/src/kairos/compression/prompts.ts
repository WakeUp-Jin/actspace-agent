export type CompressionKind = "week" | "month" | "year" | "intra_day";

const SYSTEM_PROMPT = `你是 Kairos 的「短期记忆压缩」助手。任务是把一段时间内的 SessionEvent 流压缩成简明的 markdown 摘要。
硬约束：
- 输出不超过 1200 token（约 4200 中文字符）。
- 保留：tick 的关键决策、工具调用要点、对用户有用的回复。
- 丢弃：thinking 内容、tool args/result 原文（仅保留 toolName + 一句话摘要）、内部错误。
- 结构使用三段：## 这段时间做了什么 / ## 关键决策 / ## 未完成的事 / TODO。`;

const KIND_HEADERS: Record<CompressionKind, string> = {
  week: "你将处理一段【周记忆】（最多 7 天），合并为单份 week summary。",
  month: "你将处理一段【月记忆】（4 份左右的 week summary 合并），输出 month summary。",
  year: "你将处理一段【年记忆】（12 份左右的 month summary 合并），输出 year summary。",
  intra_day: "你将处理一段【日内溢出记忆】（同一天内 token 超阈值），输出 intra-day summary。",
};

export function getCompressionSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildCompressionUserPrompt(
  kind: CompressionKind,
  rangeLabel: string,
  body: string,
): string {
  return [
    KIND_HEADERS[kind],
    `区间：${rangeLabel}`,
    "",
    "以下是原始事件流（JSONL，每行一条 SessionEvent）：",
    "```jsonl",
    body,
    "```",
    "",
    "请输出 markdown 摘要。",
  ].join("\n");
}
