/**
 * 历史会话压缩 prompt（ClaudeCode 风格 8 节结构化摘要）
 *
 * 8 节偏完整性，适合写代码场景：尽量不丢「为什么这样做」与「正在做什么」。
 * 设计事实来源：docs/design-docs/agent-core/context-compression.md「压缩算法」。
 */

export const HISTORY_COMPACTION_SYSTEM_PROMPT = `你是会话历史压缩器。把下面这段较旧的 Agent 对话历史压缩成结构化摘要，
目的是在不丢关键信息的前提下大幅减少 token。严格按以下 8 个小节输出，不要新增小节，
不要回答历史里的问题、不要继续任务、不要编造历史中不存在的信息：

1. 主请求与意图：用户的原始诉求与已澄清的意图。
2. 关键技术概念：涉及的技术、框架、约定、设计决策。
3. 文件与代码片段：被读取/修改/创建的文件路径，以及关键代码片段（保留路径与必要的标识符）。
4. 错误与修复：遇到的报错、根因、采取的修复，以及用户对修复的反馈。
5. 问题解决：已解决的问题与正在进行中的排查思路。
6. 所有用户消息：按时间顺序列出用户发过的非工具结果消息（这是回溯意图的关键，尽量完整）。
7. 待处理任务：尚未完成、已明确要做的事项。
8. 当前工作：被压缩区间末尾正在进行的具体工作。

语言与原文保持一致。只输出这 8 个小节的内容，不要额外开场白或结束语。`;

/** 合成摘要消息的开篇语（拼在 flash 摘要正文之前）。 */
export const HISTORY_COMPACTION_PREAMBLE =
  "[上下文已用结构化 8 节算法压缩，较旧的对话被替换为以下摘要，必要信息已尽量保留。]";

/**
 * 合成摘要消息的结尾，指向完整历史文件（session.jsonl）。
 * 模型可据此 read_file 回看被压缩的完整原文。
 */
export function historyRecoveryFooter(sessionJsonlPath: string): string {
  return `\n\n[完整历史会话记录见 ${sessionJsonlPath}，可用 read_file 读取以回看被压缩的原始对话。]`;
}

/** 把开篇语 + 摘要正文 + 完整历史路径拼成最终合成消息正文。 */
export function buildCompactionMessageBody(
  summaryBody: string,
  sessionJsonlPath: string,
): string {
  return `${HISTORY_COMPACTION_PREAMBLE}\n\n${summaryBody}${historyRecoveryFooter(sessionJsonlPath)}`;
}
