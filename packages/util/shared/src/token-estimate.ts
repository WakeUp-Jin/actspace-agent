/**
 * 上下文 token 估算，唯一一套（规范 agent-spec-request-record.md §6.1，照 DSH dsh-token-meter）。
 *
 * - 文本一律 4 个字符算 1 token；非字符串内容先 JSON.stringify。
 * - 每一项内容（系统提示词的一段、一个工具、一条补充、消息里的一块）再加 BLOCK_OVERHEAD。
 * - 每条对话消息再加 MESSAGE_OVERHEAD。
 *
 * 面板、圆环、日志折叠、自动压缩、容量检查、压缩替换事件都用这里的函数，数字才能对得上。
 * 改算法时同时改 ESTIMATOR_VERSION。
 */

export const ESTIMATOR_VERSION = "chars4-block4-message4";
export const CHARS_PER_TOKEN = 4;
export const BLOCK_OVERHEAD = 4;
export const MESSAGE_OVERHEAD = 4;

export function estimateCharCount(chars: number): number {
  return chars > 0 ? Math.ceil(chars / CHARS_PER_TOKEN) : 0;
}

export function estimateText(text: string): number {
  return estimateCharCount(text.length);
}

/** 字符串直接算；其他值按 JSON 文本算；空值为 0。 */
export function estimateValue(value: unknown): number {
  if (typeof value === "string") return estimateText(value);
  if (value === undefined || value === null) return 0;
  return estimateText(JSON.stringify(value) ?? "");
}

/** 一项非对话内容：内容本身加一块的开销。 */
export function estimateItem(value: unknown): number {
  return estimateValue(value) + BLOCK_OVERHEAD;
}

/** 消息里的一块。文本、思考按文字算；工具调用按名字加参数算；其他按 JSON 算。 */
export function estimateBlock(block: unknown): number {
  if (block === null || typeof block !== "object" || Array.isArray(block)) return estimateItem(block);
  const value = block as Record<string, unknown>;
  if ((value.type === "text" || value.type === "reasoning") && typeof value.text === "string")
    return estimateText(value.text) + BLOCK_OVERHEAD;
  if (value.type === "tool-call" && typeof value.name === "string")
    return estimateText(value.name) + estimateValue(value.arguments) + BLOCK_OVERHEAD;
  return estimateItem(block);
}

/** 一条消息的内容（不含消息开销）。字符串内容按一块文本算。 */
export function estimateContent(content: unknown): number {
  if (Array.isArray(content)) return content.reduce<number>((sum, block) => sum + estimateBlock(block), 0);
  if (typeof content === "string") return estimateText(content) + BLOCK_OVERHEAD;
  return estimateItem(content);
}

/** 一条对话消息：内容加消息开销。 */
export function estimateMessage(content: unknown): number {
  return estimateContent(content) + MESSAGE_OVERHEAD;
}

/** 一次实际请求的输入（容量检查用）：每条消息、每个工具定义。 */
export function estimateRequestInput(input: {
  readonly messages: readonly { readonly content: unknown }[];
  readonly tools: readonly unknown[];
}): number {
  return (
    input.messages.reduce<number>((sum, message) => sum + estimateMessage(message.content), 0) +
    input.tools.reduce<number>((sum, tool) => sum + estimateItem(tool), 0)
  );
}
