import type { FileHandle } from "node:fs/promises";
import { TOOL_OUTPUT_LINE_CHARS, TOOL_OUTPUT_TEXT_CHARS, sliceWholeChars } from "@actspace/tool-runtime";

const CHUNK_BYTES = 64 * 1024;
/** 比这大的文件不数总行数：读完要的范围就停，不把整个文件扫一遍。 */
const COUNT_LINES_MAX_BYTES = 64 * 1024 * 1024;
/** 开头这么多字节里有 NUL 就当二进制。 */
const BINARY_SNIFF_BYTES = 8_192;
/** 一行最多留这么多字节再解码。2,000 个 UTF-16 单元至多 6,000 字节，所以留下的一定够切。 */
const LINE_KEEP_BYTES = TOOL_OUTPUT_LINE_CHARS * 4;

export type NumberedRange =
  | { readonly kind: "binary" }
  | { readonly kind: "empty" }
  | {
      readonly kind: "lines";
      /** 带行号的文本；范围里一行都没有时是空串。 */
      readonly text: string;
      /** 最后一个输出的行号；一行都没有时是 0。 */
      readonly lastLine: number;
      /** 文件总行数（换行符个数 + 1）；文件太大、没扫到结尾时是 null。 */
      readonly totalLines: number | null;
      /** 输出的最后一行之后还有没有行。 */
      readonly more: boolean;
      /** 是输出预算而不是 limit 让它停下的。 */
      readonly budgetExhausted: boolean;
      /** 被截短的行数。 */
      readonly cutLines: number;
    };

export type NumberedLines = Extract<NumberedRange, { kind: "lines" }>;

/**
 * 从已打开的文件里读 [offset, offset + limit) 这些行，边读边按 `\n` 切，不把整个文件放进内存。
 * 输出受两个上限约束：一行最多 TOOL_OUTPUT_LINE_CHARS，合计最多 TOOL_OUTPUT_TEXT_CHARS（按整行停）。
 * 行的算法和 `text.split("\n")` 一致：最后一个换行符后面的空串也算一行。
 */
export async function readNumberedRange(
  handle: FileHandle,
  size: number,
  offset: number,
  limit: number,
  signal: AbortSignal,
): Promise<NumberedRange> {
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  const countTotal = size <= COUNT_LINES_MAX_BYTES;
  const endExclusive = offset + limit;
  const out: string[] = [];
  let outChars = 0;
  let line = 1;
  let lineBytes = 0;
  let kept: Buffer[] = [];
  let keptBytes = 0;
  let lastLine = 0;
  let cutLines = 0;
  let rangeDone = false;
  let budgetExhausted = false;

  const finishLine = (): void => {
    if (!rangeDone && line >= offset) {
      const decoded = Buffer.concat(kept, keptBytes).toString("utf8");
      const cut = lineBytes > keptBytes || decoded.length > TOOL_OUTPUT_LINE_CHARS;
      const rendered = `${String(line).padStart(6)}|${cut ? `${sliceWholeChars(decoded, TOOL_OUTPUT_LINE_CHARS)} ...[line truncated: ${lineBytes} bytes]` : decoded}`;
      const cost = rendered.length + (out.length === 0 ? 0 : 1);
      if (out.length > 0 && outChars + cost > TOOL_OUTPUT_TEXT_CHARS) {
        budgetExhausted = true;
        rangeDone = true;
      } else {
        out.push(rendered);
        outChars += cost;
        lastLine = line;
        if (cut) cutLines += 1;
        if (line + 1 >= endExclusive) rangeDone = true;
      }
    }
    line += 1;
    lineBytes = 0;
    kept = [];
    keptBytes = 0;
  };

  let position = 0;
  for (;;) {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Read was aborted.");
    const { bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, position);
    if (bytesRead === 0) break;
    const chunk = buffer.subarray(0, bytesRead);
    if (position === 0 && chunk.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { kind: "binary" };
    position += bytesRead;
    let cursor = 0;
    while (cursor < bytesRead) {
      const newline = chunk.indexOf(0x0a, cursor);
      const end = newline === -1 ? bytesRead : newline;
      if (!rangeDone && line >= offset && keptBytes < LINE_KEEP_BYTES && end > cursor) {
        // chunk 的内存下一轮会被覆盖，留下的片段要复制出来。
        const piece = Buffer.from(chunk.subarray(cursor, Math.min(end, cursor + LINE_KEEP_BYTES - keptBytes)));
        kept.push(piece);
        keptBytes += piece.byteLength;
      }
      lineBytes += end - cursor;
      if (newline === -1) break;
      finishLine();
      cursor = newline + 1;
      // 大文件：要的范围已经输出完，换行符后面还有一行，不再往下扫。
      if (rangeDone && !countTotal)
        return {
          kind: "lines",
          text: out.join("\n"),
          lastLine,
          totalLines: null,
          more: true,
          budgetExhausted,
          cutLines,
        };
    }
  }
  if (position === 0) return { kind: "empty" };
  finishLine();
  const totalLines = line - 1;
  return {
    kind: "lines",
    text: out.join("\n"),
    lastLine,
    totalLines,
    more: lastLine > 0 && lastLine < totalLines,
    budgetExhausted,
    cutLines,
  };
}
