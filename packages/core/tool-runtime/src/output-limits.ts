import type { ToolArtifactRef, ToolDetailBlock, ToolModelOutputBlock } from "./executor.js";
import type { ToolExecutionResult } from "./result.js";

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

/**
 * tool-runtime 的兜底上限：一条工具结果各部分序列化成 JSON 之后的 UTF-8 字节数，
 * 和会话记录单条 1 MiB 的限制是同一种量法。几项加起来约 608 KiB，一条 `tool/result` 写得进去。
 * `artifacts` 不在这里限制：每一项都是 Host 真的存下来的文件，一次调用到不了让记录超限的数量。
 * 工具自己的上限（上面两个数）远低于这里，正常输出不会走到这一步被再截一次。
 */
export const TOOL_RESULT_MODEL_OUTPUT_BYTES = 256 * 1024;
export const TOOL_RESULT_DETAIL_BYTES = 256 * 1024;
export const TOOL_RESULT_RENDERER_BYTES = 64 * 1024;
/** `summary`、`failure.message` 各自的上限。`approvalReason` 在产生的地方已经限制在 500 字符。 */
export const TOOL_RESULT_TEXT_FIELD_BYTES = 16 * 1024;
/** 按窗口给的字符额度再小也按这个数算：放得下截断说明、完整输出的文件引用和一小段开头。 */
export const TOOL_RESULT_MODEL_OUTPUT_MIN_CHARS = 2_048;
/** 一批调用共用额度时，给每个还没出结果的调用留的字符数：搜索结果、短文件、目录列表这类常见的小结果放得下。 */
export const TOOL_BATCH_PENDING_CALL_CHARS = 8_000;
/** 一个文件引用块渲染给模型后大约这么多字符（标签、类型、路径和读取提示）。 */
const REFERENCE_CHARS = 400;
/** 截断说明和新增的文件引用占的位置，字节和字符都按这个数预留。 */
const NOTE_RESERVE = 1_024;
const DETAIL_MAX_BLOCKS = 256;
const DETAIL_LABEL_CHARS = 200;

export type ToolResultBounds = {
  /**
   * 这次调用给模型的输出最多多少个字符（UTF-16 单元，和上下文估算用的单位一致）。
   * 来自这一批调用按上下文窗口共用的额度（ToolOutputBudget）；不给就只受字节上限约束。
   */
  readonly modelOutputChars?: number;
  /** 把完整输出存成会话拥有的文件。抛错时照样截断，说明里写明没能保存。 */
  readonly saveFullOutput: (text: string) => Promise<ToolArtifactRef>;
};

/**
 * 结果提交前的最后一道：超过上限的部分截短，状态和失败码不动（副作用已经发生）。
 * 没有超限时原样返回同一个对象。
 */
export async function boundToolResult(result: ToolExecutionResult, bounds: ToolResultBounds): Promise<ToolExecutionResult> {
  const maxChars = typeof bounds.modelOutputChars === "number" && Number.isFinite(bounds.modelOutputChars) ? Math.max(TOOL_RESULT_MODEL_OUTPUT_MIN_CHARS, Math.floor(bounds.modelOutputChars)) : undefined;
  let next: ToolExecutionResult = result;
  const summary = capToolResultText(result.summary);
  if (summary !== result.summary) next = { ...next, summary };
  if (result.failure !== undefined) {
    const message = capToolResultText(result.failure.message);
    if (message !== result.failure.message) next = { ...next, failure: { ...result.failure, message } };
  }
  if (result.renderer !== undefined && !fitsJsonBytes(result.renderer.props, TOOL_RESULT_RENDERER_BYTES)) {
    // 渲染提示放不下就整个去掉，界面退回通用工具卡片。
    const { renderer: _dropped, ...rest } = next;
    next = rest;
  }
  if (!fitsJsonBytes(result.detail, TOOL_RESULT_DETAIL_BYTES)) next = { ...next, detail: Object.freeze(boundDetail(result.detail)) };
  if (!fitsJsonBytes(result.modelOutput, TOOL_RESULT_MODEL_OUTPUT_BYTES) || (maxChars !== undefined && toolModelOutputChars(result.modelOutput) > maxChars)) {
    const bounded = await boundModelOutput(result.modelOutput, maxChars, bounds.saveFullOutput);
    next = { ...next, modelOutput: Object.freeze(bounded.modelOutput), artifacts: Object.freeze(bounded.saved === undefined ? [...result.artifacts] : [...result.artifacts, bounded.saved]) };
  }
  return next === result ? result : Object.freeze(next);
}

/** 结果里的一段说明文字（`summary`、失败消息）超过上限时只留开头。 */
export function capToolResultText(text: string): string {
  if (fitsJsonBytes(text, TOOL_RESULT_TEXT_FIELD_BYTES)) return text;
  return `${headWithinJsonBytes(text, TOOL_RESULT_TEXT_FIELD_BYTES - 64)} ...[truncated]`;
}

type ArtifactBlock = Extract<ToolModelOutputBlock, { type: "artifact" }>;

/** 给模型的输出按上下文估算的口径有多少字符：文本和 json 的文字，加上每个文件引用渲染后的大致长度。 */
export function toolModelOutputChars(blocks: readonly ToolModelOutputBlock[]): number {
  let chars = 0;
  for (const block of blocks) chars += block.type === "text" ? block.text.length : block.type === "json" ? (JSON.stringify(block.value) ?? "null").length : REFERENCE_CHARS;
  return chars;
}

/**
 * 一批工具调用共用的输出额度（字符）。Agent Loop 按上下文窗口给出这一批合计能用多少，
 * 调用按出结果的先后来取：先出结果的可以用剩下的全部额度，只给每个还没出结果的调用留一份
 * （TOOL_BATCH_PENDING_CALL_CHARS；剩下的不够这样留时就平分）。
 *
 * 不按调用数平分，是因为一批里常常只有一两个大结果：平分会把它们截短，而其他调用根本用不完自己那份。
 * 全是大结果时，后出结果的调用拿到的也不会少于留给它的那一份。
 */
export class ToolOutputBudget {
  #remaining: number;
  #pending: number;

  constructor(batchChars: number, calls: number) {
    this.#remaining = Math.max(0, Math.floor(batchChars));
    this.#pending = Math.max(0, Math.floor(calls));
  }

  /** 一个调用出了结果，原本要给模型 wanted 个字符：返回它最多能给多少，并记下它用掉的部分。每个调用取一次。 */
  take(wanted: number): number {
    const others = Math.max(0, this.#pending - 1);
    const share = Math.floor(this.#remaining / Math.max(1, this.#pending));
    const allowance = this.#remaining - others * Math.min(TOOL_BATCH_PENDING_CALL_CHARS, share);
    // 额度再小，截短后的结果也有 TOOL_RESULT_MODEL_OUTPUT_MIN_CHARS 那么长（boundToolResult）。
    this.#remaining = Math.max(0, this.#remaining - Math.min(Math.max(0, wanted), Math.max(allowance, TOOL_RESULT_MODEL_OUTPUT_MIN_CHARS)));
    this.#pending = others;
    return allowance;
  }
}

async function boundModelOutput(blocks: readonly ToolModelOutputBlock[], maxChars: number | undefined, save: (text: string) => Promise<ToolArtifactRef>): Promise<{ readonly modelOutput: ToolModelOutputBlock[]; readonly saved?: ToolArtifactRef }> {
  const maxBytes = TOOL_RESULT_MODEL_OUTPUT_BYTES;
  // 模型看到的 json 块本来就是序列化后的文本（context-engine 的转换），所以按文本合并。
  const full = blocks.flatMap((block) => block.type === "text" ? [block.text] : block.type === "json" ? [JSON.stringify(block.value) ?? "null"] : []).join("\n");
  const references = blocks.filter((block): block is ArtifactBlock => block.type === "artifact");
  // 引用本身就占掉一半以上时不再逐个列给模型；它们仍在 result.artifacts 里。
  const listed = fitsJsonBytes(references, Math.floor(maxBytes / 2)) && (maxChars === undefined || references.length * REFERENCE_CHARS <= maxChars / 2) ? references : [];
  const byteHead = headWithinJsonBytes(full, maxBytes - NOTE_RESERVE - (listed.length === 0 ? 0 : jsonBytes(listed)));
  const charHead = maxChars === undefined ? byteHead : sliceWholeChars(byteHead, Math.max(0, maxChars - NOTE_RESERVE - listed.length * REFERENCE_CHARS));
  // 说明里写的是真正起作用的那个限制。
  const windowLimited = charHead.length < byteHead.length;
  let head = charHead;
  const truncated = head.length < full.length;
  let saved: ToolArtifactRef | undefined;
  if (truncated) {
    // 最后四分之一里有换行就停在整行上。
    const lineEnd = head.lastIndexOf("\n");
    if (lineEnd > head.length * 0.75) head = head.slice(0, lineEnd);
    try { saved = await save(full); } catch { saved = undefined; }
  }
  const totalBytes = Buffer.byteLength(full, "utf8");
  const compose = (shown: string): ToolModelOutputBlock[] => {
    const notes: string[] = [];
    if (truncated) {
      const what = windowLimited
        ? `this tool returned ${full.length} characters and the context window has room for about ${maxChars}. The first ${shown.length} characters are shown.`
        : `this tool returned ${totalBytes} bytes, more than one result can hold. The first ${Buffer.byteLength(shown, "utf8")} bytes are shown.`;
      notes.push(`[Output truncated: ${what} ${saved === undefined ? "The full output could not be saved." : "The full output was saved as a file."}]`);
    }
    if (listed.length < references.length) notes.push(`[${references.length} file references are not listed here: together they do not fit in one result.]`);
    const text = shown.length === 0 ? notes.join("\n") : notes.length === 0 ? shown : `${shown}\n\n${notes.join("\n")}`;
    return [{ type: "text", text }, ...listed, ...(saved === undefined ? [] : [{ type: "artifact" as const, artifact: saved, label: "Full tool output" }])];
  };
  let modelOutput = compose(head);
  // 预留的位置万一不够：序列化后每个 UTF-16 单元至少占 1 字节，按超出的量去掉开头的末尾，一定在变小。
  const excess = (): number => Math.max(jsonBytes(modelOutput) - maxBytes, maxChars === undefined ? 0 : toolModelOutputChars(modelOutput) - maxChars);
  for (let over = excess(); over > 0 && head.length > 0; over = excess()) {
    head = sliceWholeChars(head, Math.max(0, head.length - over));
    modelOutput = compose(head);
  }
  return { modelOutput, ...(saved === undefined ? {} : { saved }) };
}

function boundDetail(detail: readonly ToolDetailBlock[]): ToolDetailBlock[] {
  let used = 2;
  // 逐块处理：放不下的块换成一句说明，后面放得下的小块（比如计数）照常保留。
  return detail.slice(0, DETAIL_MAX_BLOCKS).map((block) => {
    const bytes = jsonBytes(block) + 1;
    if (used + bytes <= TOOL_RESULT_DETAIL_BYTES) { used += bytes; return block; }
    const marker: ToolDetailBlock = { label: sliceWholeChars(block.label, DETAIL_LABEL_CHARS), value: `[Detail omitted: ${bytes} bytes is over the size limit for one tool result.]` };
    used += jsonBytes(marker) + 1;
    return marker;
  });
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "null", "utf8");
}

function fitsJsonBytes(value: unknown, maxBytes: number): boolean {
  // 字符串序列化后每个 UTF-16 单元最多 6 字节（\uXXXX），够小就不用序列化。
  if (typeof value === "string" && value.length * 6 + 2 <= maxBytes) return true;
  const json = JSON.stringify(value) ?? "null";
  // 一个 UTF-16 单元编码成 UTF-8 最多 3 字节。
  return json.length * 3 <= maxBytes || Buffer.byteLength(json, "utf8") <= maxBytes;
}

/** 最长的一段开头，序列化成 JSON 字符串后（不算两个引号）不超过 maxBytes 字节。 */
function headWithinJsonBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  // 每个单元至少 1 字节，答案不会长过 maxBytes 个单元；先截到这么长，后面量的都是有界的一段。
  const capped = sliceWholeChars(text, Math.floor(maxBytes));
  if (jsonBytes(capped) - 2 <= maxBytes) return capped;
  let low = 0;
  let high = capped.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (jsonBytes(sliceWholeChars(capped, middle)) - 2 <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return sliceWholeChars(capped, low);
}
