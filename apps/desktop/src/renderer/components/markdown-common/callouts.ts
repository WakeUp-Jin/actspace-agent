/**
 * GitHub 提示框 `> [!NOTE]` 的类型、中文标签和语义色，「文档」编辑器和聊天区共用。
 * 规则见 front-Markdown编辑与渲染规范.md §5、front-聊天区Markdown渲染规范.md §5.3。
 */

export type CalloutType = "note" | "tip" | "important" | "warning" | "caution";

export const CALLOUT_LABEL: Record<CalloutType, string> = {
  note: "说明",
  tip: "提示",
  important: "重要",
  warning: "注意",
  caution: "警告",
};

/** 语义色：只引用主题变量，浅色 / 深色自动翻转。 */
export const CALLOUT_COLOR_VAR: Record<CalloutType, string> = {
  note: "var(--act-color-info)",
  tip: "var(--act-color-success)",
  important: "var(--act-color-text)",
  warning: "var(--act-color-warning)",
  caution: "var(--act-color-danger)",
};

/** 引用块首行的 `[!TYPE]` 标记；`match[0]` 含标记后的空白和换行。 */
export const CALLOUT_MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)?/i;

export function parseCalloutMarker(text: string): { type: CalloutType; length: number } | null {
  const match = CALLOUT_MARKER_RE.exec(text);
  if (!match) return null;
  return { type: match[1].toLowerCase() as CalloutType, length: match[0].length };
}
