/**
 * OutputTruncator — 非 bash 工具的输出压缩流水线（异步纯函数）
 *
 * 替换 scheduler 旧的「一刀切 slice 到 truncateThreshold」：
 * - 低于阈值原样穿透（不加任何标记）。
 * - 超阈值 → 送 flash 前先头尾截断到 absoluteMaxChars，再按工具类型摘要，
 *   摘要前拼压缩标记；summarizer 不可用/失败时退化为确定性头尾截断。
 *
 * bash 不进此流水线（bash 在 run-process/executor 自处理：流式落盘 + 头部截断）。
 *
 * 设计事实来源：docs/design-docs/agent-core/context-compression.md
 * 「非 bash 工具压缩流水线（OutputTruncator）」。
 */

import type { ToolPreviewKind, ToolOutputRef } from "@actspace/shared";
import type { Summarizer } from "../context/compression/summarizer";
import { compressedNotice, recoveryHintFor } from "../context/compression/tool-summary-prompts";
import { DEFAULT_COMPRESSION_CONFIG } from "../context/types";

export interface ProcessToolOutputConfig {
  /** 通用工具（web/generic）摘要触发阈值，默认 2000 */
  toolTruncateThreshold?: number;
  /** 读取类工具（read/grep/glob/directory_list）摘要触发阈值，默认 20000 */
  readTruncateThreshold?: number;
  /** 送 flash 前头尾截断上限，默认 100000 */
  absoluteMaxChars?: number;
  /** flash 摘要器；缺省/失败时退化为确定性头尾截断 */
  summarizer?: Summarizer;
}

export interface ProcessedToolOutput {
  /** 回填给 LLM 的文本（可能含压缩标记）。 */
  modelOutput: string;
  /** 全量原文引用（inline），供 bridge 填 rawOutput / rawOutputRef。 */
  rawOutputRef: ToolOutputRef;
}

/** 读取类工具：用更高阈值，让常规读取逐字穿透。 */
const READ_KINDS: ReadonlySet<ToolPreviewKind> = new Set([
  "read",
  "grep",
  "glob",
  "directory_list",
  "search",
]);

/**
 * 头尾保留截断：保头 70% + 中间省略标记 + 保尾 30%。
 * 优于纯掐头——报错/结论常在尾部。
 */
export function headTailTruncate(text: string, cap: number): string {
  if (cap <= 0 || text.length <= cap) return text;
  const headLen = Math.floor(cap * 0.7);
  const tailLen = cap - headLen;
  const omitted = text.length - cap;
  return (
    text.slice(0, headLen) +
    `\n\n[... 中间省略 ${omitted} 字符（原始共 ${text.length} 字符）...]\n\n` +
    text.slice(text.length - tailLen)
  );
}

function thresholdFor(kind: ToolPreviewKind, config: ProcessToolOutputConfig): number {
  if (READ_KINDS.has(kind)) {
    return config.readTruncateThreshold ?? DEFAULT_COMPRESSION_CONFIG.readTruncateThreshold;
  }
  return config.toolTruncateThreshold ?? DEFAULT_COMPRESSION_CONFIG.toolTruncateThreshold;
}

/** 处理单个非 bash 工具的渲染输出。 */
export async function processToolOutput(
  kind: ToolPreviewKind,
  renderedText: string,
  config: ProcessToolOutputConfig = {},
): Promise<ProcessedToolOutput> {
  const threshold = thresholdFor(kind, config);
  if (renderedText.length <= threshold) {
    return {
      modelOutput: renderedText,
      rawOutputRef: { kind: "inline", value: renderedText },
    };
  }

  const absoluteMax = config.absoluteMaxChars ?? DEFAULT_COMPRESSION_CONFIG.absoluteMaxChars;
  const summaryInput = headTailTruncate(renderedText, absoluteMax);

  let summaryBody: string;
  if (config.summarizer) {
    try {
      summaryBody = await config.summarizer.summarizeToolOutput(kind, summaryInput);
    } catch {
      // flash 失败：确定性兜底，不阻塞主流程
      summaryBody = headTailTruncate(renderedText, threshold);
    }
  } else {
    summaryBody = headTailTruncate(renderedText, threshold);
  }

  const notice = compressedNotice(renderedText.length, recoveryHintFor(kind));
  return {
    modelOutput: `${notice}\n${summaryBody}`,
    rawOutputRef: { kind: "inline", value: renderedText },
  };
}
