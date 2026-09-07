export const TOOL_LOG_LINE_CLASS =
  "tool-log-line relative flex min-w-0 items-center gap-1.5 px-[var(--conversation-text-inset)] text-sm font-normal leading-[1.42] text-text-muted";

export const TOOL_LOG_LINE_RUNNING_CLASS = "is-running text-text-main";
export const TOOL_LOG_LINE_ERROR_CLASS = "is-error text-danger";

export const TOOL_LOG_LINE_TEXT_CLASS = "tool-log-line-text min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
export const TOOL_LOG_LINE_TEXT_RUNNING_CLASS = "tool-log-text-running";

export function getToolLogRunningTextAttrs(text: string): { "data-shimmer-text": string } {
  return { "data-shimmer-text": text };
}
