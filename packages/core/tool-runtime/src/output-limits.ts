/** 工具自己给模型的一段文本的上限（UTF-16 单元）。grep、glob 用的是同一个数。 */
export const TOOL_OUTPUT_TEXT_CHARS = 64_000;
/** 单行上限：更长的行只留开头，由工具注明原始长度。 */
export const TOOL_OUTPUT_LINE_CHARS = 2_000;

/** 取开头最多 maxChars 个 UTF-16 单元，不把一个代理对切成两半。 */
export function sliceWholeChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = Math.max(0, Math.floor(maxChars));
  if (end > 0) {
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  }
  return text.slice(0, end);
}
