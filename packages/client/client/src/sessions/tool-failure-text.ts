/**
 * Chinese row text for tool failure codes (agent-deep-search-and-document-parsing.md §7.6). Unknown codes show the
 * tool's English message as is.
 */
const DEEP_SEARCH_FAILURE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  DEEP_SEARCH_UNAVAILABLE: "深度搜索已关闭或 DeepSeek 未连接。",
  // The main Agent denies a call whose tool was hidden after the model issued it; the user sees the same cause.
  TOOL_SCOPE_DENIED: "深度搜索已关闭或 DeepSeek 未连接。",
  DEEP_SEARCH_IDLE_TIMEOUT: "40 秒没有收到新数据，已停止本次深度搜索。",
  DEEP_SEARCH_TIMEOUT: "超过 120 秒仍未完成，已停止本次深度搜索。",
  DEEPSEEK_AUTH_FAILED: "DeepSeek API Key 无效或已被删除。",
  DEEPSEEK_INSUFFICIENT_BALANCE: "DeepSeek 账户余额不足，深度搜索没有执行。",
  DEEPSEEK_RATE_LIMITED: "DeepSeek 请求过于频繁，稍后再试。",
  DEEPSEEK_CONTENT_RISK: "DeepSeek 拒绝了这个问题（内容安全）。",
});

export function deepSearchFailureText(code: string | undefined, message: string | undefined): string {
  return (code ? DEEP_SEARCH_FAILURE_TEXT[code] : undefined) ?? message ?? "";
}
