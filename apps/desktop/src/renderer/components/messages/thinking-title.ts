/**
 * 「简化思考过程」的标题文字（中间消息区规范 › 简化思考过程）。纯函数，每次渲染都可能调用，
 * 所以只看正文开头一小段，工作量不随思考长度增长。
 */

/** 只看正文前这么多个字符；开头一句一定落在这里面（宽度上限远小于它）。 */
const SCAN_LIMIT = 200;
/** 开头一句的最大显示宽度：中日韩字符算 2，其余算 1。 */
export const OPENING_CLAUSE_MAX_WIDTH = 36;

const CJK_TERMINATORS = new Set(["，", "。", "：", "；", "！", "？", "\n"]);
const ASCII_TERMINATORS = new Set([",", ".", ":", ";", "!", "?"]);
const MARKDOWN_MARKERS = /^[\s#*\->`_]+/;
const TRAILING_MARKERS = /[\s*`_]+$/;

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  // CJK 统一表意、假名、全角符号与韩文：按 2 计。
  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
    ? 2
    : 1;
}

/**
 * 这段思考的第一个分句；分句还没写完、也没超出宽度上限时返回 `null`（调用方继续等）。
 * 结束于 `，。：；！？`、换行，或后面跟空白 / 收尾 Markdown 标记（`*` `` ` `` `_`）的 `, . : ; ! ?`；不含这个标点；去掉首尾的 Markdown 标记。
 * 分句写完但去掉标记后为空时返回空串，表示这段思考不显示开头一句。
 */
export function thinkingOpeningClause(content: string): string | null {
  const head = content.slice(0, SCAN_LIMIT).replace(MARKDOWN_MARKERS, "");
  const chars = Array.from(head);
  let width = 0;
  let clause = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] as string;
    if (CJK_TERMINATORS.has(char)) return clause.replace(TRAILING_MARKERS, "");
    if (ASCII_TERMINATORS.has(char)) {
      const next = chars[index + 1];
      if (next === undefined) return null;
      // `file.ts` 里的点不算；`**Plan:**` 这种标点后紧跟收尾标记的算。
      if (/[\s*`_]/.test(next)) return clause.replace(TRAILING_MARKERS, "");
    }
    const nextWidth = width + charWidth(char);
    if (nextWidth > OPENING_CLAUSE_MAX_WIDTH) return `${clause.replace(TRAILING_MARKERS, "")}…`;
    width = nextWidth;
    clause += char;
  }
  return null;
}

/** `6s`、`1m 5s`、`2m`；最少 `1s`。 */
export function formatThinkingElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
