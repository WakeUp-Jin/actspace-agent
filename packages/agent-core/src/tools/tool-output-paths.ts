/**
 * 工具大输出落盘路径构造
 *
 * bash 大输出落盘到 `<tmpRoot>/tool-output/<sessionId>/<uniqueId>-bash.txt`，
 * 不污染 workspace。仅 bash 等「全量本就该落盘」的工具使用；其余工具不落盘。
 *
 * 设计事实来源：docs/design-docs/agent-context-compression.md「bash 流式落盘」。
 */

import { join } from "node:path";

export const TOOL_OUTPUT_DIRNAME = "tool-output";

export interface ToolOutputPathInput {
  /** 落盘根目录，通常是 <userData>/tmp */
  tmpRoot: string;
  /** 会话 id，用于分目录；缺省归到 default */
  sessionId?: string;
  /** 本次执行的唯一片段（如 toolCallId 或时间戳+随机） */
  uniqueId: string;
  /** 文件用途标签，默认 bash */
  label?: string;
}

/** 该会话的工具落盘目录：`<tmpRoot>/tool-output/<sessionId>`。 */
export function toolOutputDir(tmpRoot: string, sessionId?: string): string {
  return join(tmpRoot, TOOL_OUTPUT_DIRNAME, sessionId ?? "default");
}

/** 构造单次工具输出文件的绝对路径。 */
export function buildToolOutputPath(input: ToolOutputPathInput): string {
  const label = input.label ?? "bash";
  return join(toolOutputDir(input.tmpRoot, input.sessionId), `${input.uniqueId}-${label}.txt`);
}

/** 生成一个进程内大概率唯一的执行片段（时间戳 + 随机后缀）。 */
export function createToolOutputId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
